use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};
use windows::core::HSTRING;

/// A toast needs an app identity; borrowing PowerShell's is the well-known way for a plain program to have one.
const APP_ID: &str = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

pub struct Notify;

impl Capability for Notify {
    fn name(&self) -> &'static str {
        "notify"
    }
    fn tier(&self) -> Tier {
        Tier::Act
    }
    fn description(&self) -> &'static str {
        "Show a notification on the PC with a title and a line of text"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["title"], "properties": { "title": { "type": "string", "maxLength": 100 }, "text": { "type": "string", "maxLength": 300 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let title = input["title"].as_str().ok_or("title is required")?;
        let text = input["text"].as_str().unwrap_or("");
        let fail = |e: windows::core::Error| format!("could not show the notification: {e}");
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let xml = XmlDocument::new().map_err(fail)?;
        xml.LoadXml(&HSTRING::from(format!("<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>", escape(title), escape(text)))).map_err(fail)?;
        let toast = ToastNotification::CreateToastNotification(&xml).map_err(fail)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)).map_err(fail)?.Show(&toast).map_err(fail)?;
        Ok(Output::text("Notification shown."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_what_would_break_the_markup() {
        assert_eq!(escape("a<b>&\"'"), "a&lt;b&gt;&amp;&quot;&apos;");
    }
}
