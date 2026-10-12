//! Where a window goes on a monitor: plain arithmetic over the monitor's work area, kept apart from the Win32 calls so
//! it is tested on every OS.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

pub const AREAS: &[&str] = &[
    "full",
    "left",
    "right",
    "top",
    "bottom",
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "left_third",
    "center_third",
    "right_third",
    "top_third",
    "middle_third",
    "bottom_third",
];

// Part `i` of `n` along one side. Integer division with the next part starting where this one ends, so the parts tile
// the side with no gap and no overlap whatever the size.
fn split(from: i32, to: i32, i: i32, n: i32) -> (i32, i32) {
    let len = to - from;
    (from + len * i / n, from + len * (i + 1) / n)
}

/// The part of `work` an area names: halves, quarters, thirds as columns (`left_third`, `center_third`,
/// `right_third`) or as rows (`top_third`, `middle_third`, `bottom_third`).
pub fn area(work: Rect, name: &str) -> Option<Rect> {
    let (cols, col, rows, row) = match name {
        "full" => (1, 0, 1, 0),
        "left" => (2, 0, 1, 0),
        "right" => (2, 1, 1, 0),
        "top" => (1, 0, 2, 0),
        "bottom" => (1, 0, 2, 1),
        "top_left" => (2, 0, 2, 0),
        "top_right" => (2, 1, 2, 0),
        "bottom_left" => (2, 0, 2, 1),
        "bottom_right" => (2, 1, 2, 1),
        "left_third" => (3, 0, 1, 0),
        "center_third" => (3, 1, 1, 0),
        "right_third" => (3, 2, 1, 0),
        "top_third" => (1, 0, 3, 0),
        "middle_third" => (1, 0, 3, 1),
        "bottom_third" => (1, 0, 3, 2),
        _ => return None,
    };
    let (left, right) = split(work.left, work.right, col, cols);
    let (top, bottom) = split(work.top, work.bottom, row, rows);
    Some(Rect { left, top, right, bottom })
}

/// A rectangle given relative to the work area's top-left corner, refused when it does not fit inside it.
pub fn inside(work: Rect, x: i32, y: i32, width: i32, height: i32) -> Result<Rect, String> {
    if x < 0 || y < 0 || width < 1 || height < 1 || x + width > work.width() || y + height > work.height() {
        return Err(format!("that rect does not fit: the work area of this monitor is {}x{}", work.width(), work.height()));
    }
    Ok(Rect { left: work.left + x, top: work.top + y, right: work.left + x + width, bottom: work.top + y + height })
}

/// The outer bounds to ask Windows for so the visible frame lands on `target`. A window's outer bounds include an
/// invisible resize border (about 7 px on Windows 10 and 11); `outer` minus `visible` (DWM's extended frame bounds)
/// measures it on each side.
pub fn outer_for(target: Rect, outer: Rect, visible: Rect) -> Rect {
    Rect {
        left: target.left - (visible.left - outer.left),
        top: target.top - (visible.top - outer.top),
        right: target.right + (outer.right - visible.right),
        bottom: target.bottom + (outer.bottom - visible.bottom),
    }
}

// Rounding in the app's own layout (a DPI change, a size snapped to a character grid) can leave a pixel or two.
const TOLERANCE: i32 = 2;

pub fn landed(target: Rect, actual: Rect) -> bool {
    [target.left - actual.left, target.top - actual.top, target.right - actual.right, target.bottom - actual.bottom].iter().all(|d| d.abs() <= TOLERANCE)
}

/// What went wrong when the window did not land where it was asked, in one line: an app with a minimum size does not
/// shrink, and that is worth saying plainly.
pub fn miss(target: Rect, actual: Rect) -> String {
    let wider = actual.width() > target.width() + TOLERANCE;
    let taller = actual.height() > target.height() + TOLERANCE;
    if wider || taller {
        format!(
            "the app did not shrink to {}x{}: it stays {}x{}, probably its minimum size",
            target.width(),
            target.height(),
            actual.width(),
            actual.height()
        )
    } else {
        format!(
            "it is {}x{} at ({},{}) instead of {}x{} at ({},{})",
            actual.width(),
            actual.height(),
            actual.left,
            actual.top,
            target.width(),
            target.height(),
            target.left,
            target.top
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn r(left: i32, top: i32, right: i32, bottom: i32) -> Rect {
        Rect { left, top, right, bottom }
    }

    // A portrait 1080x1920 monitor to the right of a 2560 px wide one, with a 48 px taskbar at its bottom.
    const PORTRAIT: Rect = r(2560, -240, 3640, 1632);

    #[test]
    fn the_top_half_of_a_portrait_monitor() {
        assert_eq!(area(PORTRAIT, "top"), Some(r(2560, -240, 3640, 696)));
        assert_eq!(area(PORTRAIT, "bottom"), Some(r(2560, 696, 3640, 1632)));
    }

    #[test]
    fn every_area_is_known_and_halves_quarters_and_thirds_tile_the_work_area() {
        let work = r(0, 0, 1001, 767);
        for name in AREAS {
            assert!(area(work, name).is_some(), "{name}");
        }
        let a = |n| area(work, n).unwrap();
        assert_eq!(a("full"), work);
        assert_eq!((a("left").right, a("right").left, a("right").right), (500, 500, 1001));
        assert_eq!((a("top_left").bottom, a("bottom_left").top), (383, 383));
        assert_eq!((a("top_right").left, a("bottom_right").bottom), (500, 767));
        assert_eq!((a("left_third").right, a("center_third").left, a("center_third").right, a("right_third").left, a("right_third").right), (333, 333, 667, 667, 1001));
        assert_eq!((a("top_third").bottom, a("middle_third").top, a("middle_third").bottom, a("bottom_third").top, a("bottom_third").bottom), (255, 255, 511, 511, 767));
        assert_eq!(area(work, "center"), None);
    }

    #[test]
    fn a_rect_is_relative_to_the_work_area_and_must_fit_in_it() {
        assert_eq!(inside(PORTRAIT, 0, 0, 1080, 936), Ok(r(2560, -240, 3640, 696)));
        assert_eq!(inside(PORTRAIT, 100, 50, 500, 400), Ok(r(2660, -190, 3160, 210)));
        assert!(inside(PORTRAIT, 0, 0, 1081, 100).unwrap_err().contains("1080x1872"));
        assert!(inside(PORTRAIT, 0, 1800, 100, 100).is_err());
        assert!(inside(PORTRAIT, -1, 0, 100, 100).is_err());
    }

    #[test]
    fn the_invisible_border_is_added_back_on_each_side() {
        // Windows 11: 7 px of invisible border left, right and bottom, none on top.
        let outer = r(93, 100, 914, 707);
        let visible = r(100, 100, 907, 700);
        assert_eq!(outer_for(r(0, 0, 540, 936), outer, visible), r(-7, 0, 547, 943));
        // No border (a window without a resize frame): the target is asked for as is.
        assert_eq!(outer_for(r(0, 0, 540, 936), visible, visible), r(0, 0, 540, 936));
    }

    #[test]
    fn landing_allows_two_pixels_and_a_miss_says_why() {
        let target = r(0, 0, 540, 936);
        assert!(landed(target, r(1, 0, 541, 934)));
        assert!(!landed(target, r(0, 0, 800, 936)));
        assert_eq!(miss(target, r(0, 0, 800, 936)), "the app did not shrink to 540x936: it stays 800x936, probably its minimum size");
        assert_eq!(miss(target, r(10, 10, 550, 946)), "it is 540x936 at (10,10) instead of 540x936 at (0,0)");
    }
}
