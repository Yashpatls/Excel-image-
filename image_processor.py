from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import math
import datetime
import csv
import openpyxl
# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont

def read_excel(path):
    path_obj = Path(path)
    if path_obj.suffix.lower() == ".csv":
        with open(path_obj, "r", encoding="utf-8-sig") as f:
            sample = f.read(4096)
            f.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample)
                reader = csv.reader(f, dialect=dialect)
            except csv.Error:
                reader = csv.reader(f)
            values = list(reader)
    else:
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.worksheets[0]
        values = list(ws.iter_rows(values_only=True))
        
    if not values:
        raise ValueError("Data file is empty.")

    headers = []
    col_indices = []
    for i, h in enumerate(values[0]):
        name = str(h).strip() if h is not None else ""
        if name:
            headers.append(name)
            col_indices.append(i)

    rows = []
    for row in values[1:]:
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        item = {}
        for idx, header in zip(col_indices, headers):
            value = row[idx] if idx < len(row) else ""
            if value is None:
                value = ""
            item[header] = str(value)
        rows.append(item)
    return headers, rows

def hex_to_rgb(value):
    value = str(value).strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return tuple(int(value[i:i+2], 16) for i in (1, 3, 5))
    return (17, 17, 17)

def get_font_path(bold=False):
    if bold:
        candidates = [
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
        ]
    else:
        candidates = [
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/Arial.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None

def safe_filename(text):
    text = re.sub(r'[<>:"/\\\\|?*]', "_", str(text)).strip()
    text = re.sub(r"\s+", "_", text)
    return text[:100] or "image"

def get_text_dimensions(draw, text, font):
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for old Pillow versions
        return draw.textsize(text, font=font)

def wrap_text(draw, text, font, max_width):
    if max_width is None:
        return [text]
    words = text.split()
    if not words:
        return []
    lines = []
    current_line = words[0]
    for word in words[1:]:
        test_line = f"{current_line} {word}"
        w, _ = get_text_dimensions(draw, test_line, font)
        if w <= max_width:
            current_line = test_line
        else:
            lines.append(current_line)
            current_line = word
    lines.append(current_line)
    return lines

def create_watermark_image(wm):
    text = wm.get("text", "")
    if not text:
        return None, 0, 0
    
    try:
        x, y = float(wm.get("x", 0)), float(wm.get("y", 0))
        w = float(wm["w"]) if "w" in wm else None
        h = float(wm["h"]) if "h" in wm else None
    except Exception:
        return None, 0, 0
    
    fs = int(wm.get("font_size", 40))
    opacity = int(wm.get("opacity", 100))
    rotation = float(wm.get("rotation", 0))
    col_hex = wm.get("color", "#ffffff")
    
    rgb = hex_to_rgb(col_hex)
    alpha = int((opacity / 100) * 255)
    fill = (*rgb, alpha)
    
    font_path = get_font_path(bold=False)
    font = ImageFont.truetype(font_path, max(8, fs)) if font_path else ImageFont.load_default()
    
    dummy = Image.new("RGBA", (1,1))
    d = ImageDraw.Draw(dummy)
    bbox = d.textbbox((0, 0), text, font=font, anchor="mm")
    txt_w = bbox[2] - bbox[0]
    txt_h = bbox[3] - bbox[1]
    
    max_dim = int(math.ceil(math.sqrt(txt_w**2 + txt_h**2)))
    if max_dim <= 0: return None, 0, 0
    
    txt_img = Image.new("RGBA", (max_dim, max_dim), (255, 255, 255, 0))
    txt_draw = ImageDraw.Draw(txt_img)
    txt_draw.text((max_dim/2, max_dim/2), text, font=font, fill=fill, anchor="mm")
    
    if rotation != 0:
        txt_img = txt_img.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
    
    center_x = x + (w / 2) if w else x
    center_y = y + (h / 2) if h else y
    
    paste_x = int(center_x - txt_img.width / 2)
    paste_y = int(center_y - txt_img.height / 2)
    
    return txt_img, paste_x, paste_y

def draw_watermark(base_image, wm):
    txt_img, paste_x, paste_y = create_watermark_image(wm)
    if txt_img:
        base_image.paste(txt_img, (paste_x, paste_y), txt_img)

def draw_aligned(draw, xy, text, font, fill, alignment, w=None, h=None, stroke_width=0, stroke_fill=None):
    x, y = xy
    
    if w is not None and h is not None:
        center_y = y + (h / 2)
        if alignment == "left":
            px = x
            anchor = "lm"
        elif alignment == "right":
            px = x + w
            anchor = "rm"
        else:
            px = x + (w / 2)
            anchor = "mm"

        draw.text(
            (px, center_y),
            text,
            font=font,
            fill=fill,
            anchor=anchor,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill
        )
    else:
        text_w, text_h = get_text_dimensions(draw, text, font)
        y_pos = y - text_h
        if alignment == "left":
            x_pos = x
        elif alignment == "right":
            x_pos = x - text_w
        else:
            x_pos = x - text_w / 2
            
        draw.text((x_pos, y_pos), text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)

import threading
import concurrent.futures

def generate_images(template_path, rows, out_dir, positions,
                    name_column, alignment="center", suffix="", progress_callback=None):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    progress_lock = threading.Lock()
    state = {"count": 0, "failed": 0}
    
    # Try to load template image once and copy it in threads to save disk I/O
    try:
        with Image.open(template_path) as original_img:
            base_image = original_img.convert("RGB")
            info = original_img.info.copy()
    except Exception:
        if progress_callback:
            progress_callback(0, len(rows))
        return 0

    def process_row(index, row):
        try:
            image = base_image.copy()
        except Exception:
            with progress_lock:
                state["failed"] += 1
                if progress_callback: progress_callback(state["count"], state["failed"])
            return

        draw = ImageDraw.Draw(image)

        for column, pos in positions.items():
            if column == '_watermark':
                continue # Handled later
                
            source_col = pos.get("source_col", column)
            if source_col not in row:
                continue
            try:
                x, y = float(pos["x"]), float(pos["y"])
                w = float(pos["w"]) if "w" in pos else None
                h = float(pos["h"]) if "h" in pos else None
            except Exception:
                continue
            text = str(row.get(source_col, "")).strip()
            if not text:
                continue
                
            fs = pos.get("font_size", 40)
            col_hex = pos.get("color", "#111111")
            is_bold = pos.get("bold", False)
            col_alignment = pos.get("alignment", alignment)
            fill = hex_to_rgb(col_hex)
            
            try:
                border_width = float(pos.get("border_width", 0))
            except Exception:
                border_width = 0.0
            border_col_hex = pos.get("border_color", "#ffffff")
            stroke_fill = hex_to_rgb(border_col_hex)

            font_path = get_font_path(bold=is_bold)
            base_font_size = max(8, int(fs))
            if font_path:
                current_font = ImageFont.truetype(font_path, base_font_size)
            else:
                current_font = ImageFont.load_default()

            wrapped_lines = [text]
            
            if w is not None and h is not None and font_path:
                current_font_size = base_font_size
                current_font = ImageFont.truetype(font_path, current_font_size)
                
                wrapped_lines = wrap_text(draw, text, current_font, w - 4)
                
                def get_total_size(lines, font):
                    if not lines: return 0, 0
                    max_w = 0
                    total_h = 0
                    for i, line in enumerate(lines):
                        lw, lh = get_text_dimensions(draw, line, font)
                        max_w = max(max_w, lw)
                        total_h += lh
                        if i < len(lines) - 1:
                            total_h += lh * 0.2
                    return max_w, total_h
                
                total_w, total_h = get_total_size(wrapped_lines, current_font)

            if w is not None and h is not None:
                total_h = 0
                line_heights = []
                for i, line in enumerate(wrapped_lines):
                    _, lh = get_text_dimensions(draw, line, current_font)
                    line_heights.append(lh)
                    total_h += lh
                    if i < len(wrapped_lines) - 1:
                        total_h += lh * 0.2
                
                current_y = y + (h - total_h) / 2
                for i, line in enumerate(wrapped_lines):
                    draw_aligned(draw, (x, current_y), line, current_font, fill, col_alignment, w, line_heights[i], stroke_width=border_width, stroke_fill=stroke_fill)
                    current_y += line_heights[i]
                    if i < len(wrapped_lines) - 1:
                        current_y += line_heights[i] * 0.2
            else:
                draw_aligned(draw, (x, y), text, current_font, fill, col_alignment, w, h, stroke_width=border_width, stroke_fill=stroke_fill)

        # Draw watermark if present
        if "_watermark" in positions:
            draw_watermark(image, positions["_watermark"])
            
        # Draw logo if present
        if "_logo" in positions:
            logo_path = template_path.parent / "logo.png"
            if logo_path.exists():
                l_pos = positions["_logo"]
                try:
                    with Image.open(logo_path) as logo_img:
                        logo = logo_img.convert("RGBA")
                        lw = int(float(l_pos.get("w", logo.width)))
                        lh = int(float(l_pos.get("h", logo.height)))
                        lx = int(float(l_pos.get("x", 0)))
                        ly = int(float(l_pos.get("y", 0)))
                        
                        if lw > 0 and lh > 0:
                            logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
                            op = float(l_pos.get("opacity", 100)) / 100
                            if op < 1.0:
                                from PIL import ImageEnhance
                                alpha = logo.split()[3]
                                alpha = ImageEnhance.Brightness(alpha).enhance(op)
                                logo.putalpha(alpha)
                            
                            image.paste(logo, (lx, ly), logo)
                except Exception as e:
                    pass

        name = safe_filename(row.get(name_column, f"row_{index}"))
        filename = f"{name}_{index}{suffix}.jpg"
        
        # Preserve DPI and color profiles for high quality
        save_kwargs = {"format": "JPEG", "optimize": False, "quality": 95} # Set optimize to False for speed
        if "dpi" in info:
            save_kwargs["dpi"] = info["dpi"]
        else:
            save_kwargs["dpi"] = (300, 300) # Default to high quality 300 DPI if none present
            
        if "icc_profile" in info:
            save_kwargs["icc_profile"] = info["icc_profile"]
            
        image.save(out_dir / filename, **save_kwargs)
        
        with progress_lock:
            state["count"] += 1
            
            if progress_callback: progress_callback(state["count"], state["failed"])
 
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(process_row, index, row) for index, row in enumerate(rows, start=1)]
        concurrent.futures.wait(futures)

    return state["count"]

def create_zip(folder, zip_path):
    folder = Path(folder)
    zip_path = Path(zip_path)
    with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
        for p in folder.rglob("*"):
            if p.is_file() and p.resolve() != zip_path.resolve():
                if p.suffix.lower() in {".xlsx", ".xlsm", ".csv"}:
                    continue
                # Write file directly to the root of the ZIP (no folders)
                z.write(p, p.name)
