// Bridge between Meridian and WhatsApp (whatsmeow). It listens on loopback only and answers
// only to the bearer token the service passes in the environment.
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// Exit codes the supervisor reads: a bridge that must not be restarted blindly says why.
const (
	exitLoggedOut    = 3
	exitPairingEnded = 4
	exitLocked       = 5
)

func main() {
	dataDir, token, addr := os.Getenv("WA_DATA_DIR"), os.Getenv("WA_TOKEN"), os.Getenv("WA_ADDR")
	if dataDir == "" || token == "" || addr == "" {
		fmt.Fprintln(os.Stderr, "WA_DATA_DIR, WA_TOKEN and WA_ADDR are required")
		os.Exit(2)
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil || !net.ParseIP(host).IsLoopback() {
		fmt.Fprintln(os.Stderr, "WA_ADDR must be a loopback address, like 127.0.0.1:7420")
		os.Exit(2)
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		die(err)
	}
	// Two bridges on one session would knock each other off WhatsApp, so only one may hold the data directory.
	lock, err := os.OpenFile(filepath.Join(dataDir, "bridge.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		die(err)
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		fmt.Fprintln(os.Stderr, "another bridge already owns this data directory")
		os.Exit(exitLocked)
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		die(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log := waLog.Stdout("whatsmeow", "WARN", false)
	container, err := sqlstore.New(ctx, "sqlite3", "file:"+filepath.Join(dataDir, "session.db")+"?_foreign_keys=on&_busy_timeout=5000", log)
	if err != nil {
		die(err)
	}
	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		die(err)
	}
	store, err := openStore(filepath.Join(dataDir, "messages.db"))
	if err != nil {
		die(err)
	}

	app := &App{client: whatsmeow.NewClient(device, log), store: store, dataDir: dataDir, state: "connecting", onDemand: make(chan struct{}, 1)}
	app.client.AddEventHandler(app.onEvent)

	srv := &http.Server{Addr: addr, Handler: app.handler(token), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			die(err)
		}
	}()
	if err := app.connect(ctx); err != nil {
		die(err)
	}

	go exitWithParent(stop)
	<-ctx.Done()
	app.client.Disconnect()
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

func die(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

// The service owns this process: if the server dies without stopping it, an orphan would keep the session
// lock and block the next bridge.
func exitWithParent(stop context.CancelFunc) {
	parent := os.Getppid()
	for range time.Tick(2 * time.Second) {
		if os.Getppid() != parent {
			stop()
			return
		}
	}
}
