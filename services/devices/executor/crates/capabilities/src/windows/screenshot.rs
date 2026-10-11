use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Win32::Graphics::Gdi::*;

use super::monitor::screens;

/// A PNG of a whole 4K screen is several megabytes of tokens' worth of bytes; this is plenty to read a screen.
const MAX_WIDTH: usize = 1600;

fn capture(left: i32, top: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
    unsafe {
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let old = SelectObject(dc, bitmap.into());
        let copied = BitBlt(dc, 0, 0, width, height, Some(screen), left, top, SRCCOPY | CAPTUREBLT);
        let mut info = BITMAPINFO { bmiHeader: BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: width, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() }, ..Default::default() };
        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(dc, bitmap, 0, height as u32, Some(bgra.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        SelectObject(dc, old);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(dc);
        ReleaseDC(None, screen);
        copied.map_err(|e| format!("could not capture the screen: {e}"))?;
        if lines == 0 {
            return Err("could not read the screen pixels".into());
        }
        Ok(bgra)
    }
}

/// Nearest-neighbour down to MAX_WIDTH, converting BGRA to opaque RGB.
fn to_rgb(bgra: &[u8], width: usize, height: usize) -> (Vec<u8>, usize, usize) {
    let (out_w, out_h) = if width > MAX_WIDTH { (MAX_WIDTH, height * MAX_WIDTH / width) } else { (width, height) };
    let mut rgb = Vec::with_capacity(out_w * out_h * 3);
    for y in 0..out_h {
        let src_y = y * height / out_h;
        for x in 0..out_w {
            let i = (src_y * width + x * width / out_w) * 4;
            rgb.extend_from_slice(&[bgra[i + 2], bgra[i + 1], bgra[i]]);
        }
    }
    (rgb, out_w, out_h)
}

fn encode(rgb: &[u8], width: usize, height: usize) -> Result<Vec<u8>, String> {
    let mut png_bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut png_bytes, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().and_then(|mut w| w.write_image_data(rgb)).map_err(|e| e.to_string())?;
    Ok(png_bytes)
}

pub struct Screenshot;

impl Capability for Screenshot {
    fn name(&self) -> &'static str {
        "screenshot"
    }
    fn tier(&self) -> Tier {
        Tier::Observe
    }
    fn description(&self) -> &'static str {
        "A picture of one monitor (default: the primary), at most 1600 pixels wide. The slow, expensive last resort: use it only when the text tools cannot tell you what you need"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "properties": { "monitor": { "type": "integer", "minimum": 1, "maximum": 16 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let all = screens();
        let wanted = input["monitor"].as_u64().unwrap_or(1) as usize;
        let s = all.iter().find(|s| s.index == wanted).ok_or_else(|| format!("there is no monitor {wanted}; there are {}", all.len()))?;
        let (w, h) = ((s.rect.right - s.rect.left), (s.rect.bottom - s.rect.top));
        let bgra = capture(s.rect.left, s.rect.top, w, h)?;
        let (rgb, out_w, out_h) = to_rgb(&bgra, w as usize, h as usize);
        let png = encode(&rgb, out_w, out_h)?;
        Ok(Output { text: format!("Screenshot of monitor {wanted}: {w}x{h} pixels, sent at {out_w}x{out_h} ({} KB).", png.len() / 1024), image_png: Some(png) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shrinks_wide_screens_and_swaps_bgra_to_rgb() {
        let wide: Vec<u8> = (0..3200 * 2).flat_map(|_| [1u8, 2, 3, 255]).collect();
        let (rgb, w, h) = to_rgb(&wide, 3200, 2);
        assert_eq!((w, h), (1600, 1));
        assert_eq!(&rgb[..3], &[3, 2, 1]);
        assert_eq!(rgb.len(), 1600 * 3);
    }

    #[test]
    fn encodes_a_png() {
        let png = encode(&[255, 0, 0, 0, 255, 0], 2, 1).unwrap();
        assert_eq!(&png[1..4], b"PNG");
    }
}
