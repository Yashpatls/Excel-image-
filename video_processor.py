from pathlib import Path
import subprocess
import re
# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont

FFMPEG_PATH = str(Path(__file__).parent / "ffmpeg.exe")

def safe_filename(text):
    text = re.sub(r'[<>:"/\\\\|?*]', "_", str(text)).strip()
    text = re.sub(r"\s+", "_", text)
    return text[:100] or "video"

def wrap_text_video(draw, text, font, max_width):
    if max_width is None:
        return [text]     
    words = text.split()
    if not words:
        return []
    lines = []
    current_line = words[0]
    for word in words[1:]:
        test_line = f"{current_line} {word}"
        try:
            bbox = draw.textbbox((0, 0), test_line, font=font)
            w = bbox[2] - bbox[0]
        except AttributeError:
            w, _ = draw.textsize(test_line, font=font)
        
        if w <= max_width:
            current_line = test_line
        else:
            lines.append(current_line)
            current_line = word
    lines.append(current_line)
    return lines

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
            return str(p).replace('\\', '/')
    return "Arial"

import threading
import concurrent.futures

def generate_videos(template_path, rows, out_dir, positions, name_column, alignment="center", suffix="", progress_callback=None):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    progress_lock = threading.Lock()
    state = {"count": 0, "failed": 0}

    def process_row(index, row):
        drawtext_filters = []
        for column, pos in positions.items():
            source_col = pos.get("source_col", column)
            if source_col not in row:
                continue
            text = str(row.get(source_col, "")).strip()
            if not text:
                continue
            
            # escape text for ffmpeg filter chain
            escaped_text = text.replace('\\', r'\\\\').replace(':', r'\:').replace("'", r"\'")
            
            try:
                x = float(pos["x"])
                y = float(pos["y"])
            except Exception:
                continue
                
            fs = pos.get("font_size", 40)
            col_hex = pos.get("color", "#111111").replace('#', '0x')
            is_bold = pos.get("bold", False)
            col_alignment = pos.get("alignment", alignment)
            
            try:
                border_width = float(pos.get("border_width", 0))
            except Exception:
                border_width = 0
            border_col_hex = pos.get("border_color", "#ffffff").replace('#', '0x')
            
            enable_str = ""
            timings = pos.get("timings", [])
            if timings:
                clauses = []
                for t_info in timings:
                    try:
                        s_t = float(t_info.get("start_time", 0))
                        e_t = t_info.get("end_time")
                        if e_t is not None:
                            e_t = float(e_t)
                            if e_t > s_t:
                                clauses.append(f"between(t,{s_t},{e_t})")
                        else:
                            clauses.append(f"gte(t,{s_t})")
                    except Exception:
                        pass
                if clauses:
                    enable_str = f":enable='{'+'.join(clauses)}'"
            elif "start_time" in pos and "end_time" in pos:
                try:
                    s_t = float(pos["start_time"])
                    e_t = float(pos["end_time"])
                    if e_t > s_t:
                        enable_str = f":enable='between(t,{s_t},{e_t})'"
                except Exception:
                    pass
            
            font_path_raw = get_font_path(bold=is_bold)
            font_path = font_path_raw.replace(':', r'\:') if ':' in font_path_raw else font_path_raw

            w = pos.get("w")
            h = pos.get("h")
            current_font_size = int(fs)
            if w is not None and h is not None:  
                current_font_size = int(fs)
                try:
                    font = ImageFont.truetype(font_path_raw, current_font_size)
                except Exception:
                    font = ImageFont.load_default()
                    
                dummy_img = Image.new("RGB", (1, 1))
                draw = ImageDraw.Draw(dummy_img)
                
                wrapped_lines = wrap_text_video(draw, text, font, float(w) - 4)
                
                def get_total_size(lines, font):
                    if not lines: return 0, 0
                    max_w = 0
                    total_h = 0
                    for i, line in enumerate(lines):
                        try:
                            bbox = draw.textbbox((0, 0), line, font=font)
                            lw = bbox[2] - bbox[0]
                            lh = bbox[3] - bbox[1]
                        except AttributeError:
                            lw, lh = draw.textsize(line, font=font)
                        max_w = max(max_w, lw)
                        total_h += lh
                        if i < len(lines) - 1:
                            total_h += lh * 0.2
                    return max_w, total_h
                
                total_w, total_h = get_total_size(wrapped_lines, font)
                
                cx = x + (float(w) / 2)
                
                line_heights = []
                for i, line in enumerate(wrapped_lines):
                    try:
                        bbox = draw.textbbox((0, 0), line, font=font)
                        lh = bbox[3] - bbox[1]
                    except AttributeError:
                        _, lh = draw.textsize(line, font=font)
                    line_heights.append(lh)
                
                total_h = sum(line_heights)
                for i in range(len(line_heights) - 1):
                    total_h += line_heights[i] * 0.2
                    
                current_y = y + (float(h) - total_h) / 2
                
                for i, line in enumerate(wrapped_lines):
                    escaped_line = line.replace('\\', r'\\\\').replace(':', r'\:').replace("'", r"\'")
                    if col_alignment == "left":
                        fx = f"{x}"
                    elif col_alignment == "right":
                        fx = f"{x}+{w}-tw"
                    else:
                        fx = f"{cx}-(tw/2)"
                    fy = f"{current_y}"
                    dt = f"drawtext=fontfile='{font_path}':text='{escaped_line}':fontcolor={col_hex}:fontsize={current_font_size}:x={fx}:y={fy}"
                    if border_width > 0:
                        dt += f":borderw={border_width}:bordercolor={border_col_hex}"
                    dt += enable_str
                    drawtext_filters.append(dt)
                    current_y += line_heights[i]
                    if i < len(wrapped_lines) - 1:
                        current_y += line_heights[i] * 0.2
            else:
                if col_alignment == "left":
                    fx = f"{x}"
                elif col_alignment == "right":
                    fx = f"{x}-tw"
                else:
                    fx = f"{x}-(tw/2)"
                fy = f"{y}-th"
                dt = f"drawtext=fontfile='{font_path}':text='{escaped_text}':fontcolor={col_hex}:fontsize={current_font_size}:x={fx}:y={fy}"
                if border_width > 0:
                    dt += f":borderw={border_width}:bordercolor={border_col_hex}"
                dt += enable_str
                drawtext_filters.append(dt)
            
        logo_path = template_path.parent / "logo.png"
        has_logo = "_logo" in positions and logo_path.exists()
        
        if not drawtext_filters and "_watermark" not in positions and not has_logo:
            return
            
        name = safe_filename(row.get(name_column, f"row_{index}"))
        filename = f"{name}_{index}{suffix}.mp4"
        out_path = out_dir / filename
        
        filter_graph = ",".join(drawtext_filters)
        
        # Use fast encoding preset for much faster generation
        cmd = [FFMPEG_PATH, "-y", "-i", str(template_path)]
        
        inputs = []
        wm_path = None
        wm_px, wm_py = 0, 0
        if "_watermark" in positions:
            from image_processor import create_watermark_image
            wm_img, px, py = create_watermark_image(positions["_watermark"])
            if wm_img:
                wm_path = out_dir / f"temp_wm_{index}.png"
                wm_img.save(wm_path)
                inputs.append(str(wm_path))
                wm_px, wm_py = px, py
                
        if has_logo:
            inputs.append(str(logo_path))
            
        for inp in inputs:
            cmd.extend(["-i", inp])
            
        current_v = "0:v"
        complex_filters = []
        
        if filter_graph:
            complex_filters.append(f"[{current_v}]{filter_graph}[vtext]")
            current_v = "vtext"
            
        input_idx = 1
        if wm_path:
            complex_filters.append(f"[{current_v}][{input_idx}:v]overlay={wm_px}:{wm_py}[vwm]")
            current_v = "vwm"
            input_idx += 1
            
        if has_logo:
            lx = positions["_logo"].get("x", 0)
            ly = positions["_logo"].get("y", 0)
            lw = positions["_logo"].get("w", 100)
            lh = positions["_logo"].get("h", 100)
            op = float(positions["_logo"].get("opacity", 100)) / 100.0
            
            scale_filter = f"scale={lw}:{lh}"
            if op < 1.0:
                scale_filter += f",format=rgba,colorchannelmixer=aa={op}"
                
            complex_filters.append(f"[{input_idx}:v]{scale_filter}[vlogo]")
            complex_filters.append(f"[{current_v}][vlogo]overlay={lx}:{ly}[vfinal]")
            current_v = "vfinal"
            input_idx += 1
            
        if complex_filters:
            full_filter = ";".join(complex_filters)
            # Add ultrafast preset and threads to optimize encoding speed
            cmd.extend([
                "-filter_complex", full_filter, 
                "-map", f"[{current_v}]", 
                "-map", "0:a?",
                "-preset", "ultrafast",
                "-threads", "2"
            ])
        else:
            cmd.extend(["-c:v", "copy", "-c:a", "copy"])
        
        cmd.append(str(out_path))
        
        success = False
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            success = True
        except subprocess.CalledProcessError as e:
            print(f"Error processing {filename}: {e}")
        finally:
            if wm_path and wm_path.exists():
                try:
                    wm_path.unlink(missing_ok=True)
                except OSError:
                    pass
            
            with progress_lock:
                if success:
                    state["count"] += 1
                else:
                    state["failed"] += 1
                if progress_callback:
                    progress_callback(state["count"], state["failed"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(process_row, index, row) for index, row in enumerate(rows, start=1)]
        concurrent.futures.wait(futures)
            
    return state["count"]

def extract_first_frame(video_path, out_image_path):
    cmd = [
        FFMPEG_PATH, "-y", "-i", str(video_path),
        "-vframes", "1", "-q:v", "2",
        str(out_image_path)
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except subprocess.CalledProcessError:
        return False


 