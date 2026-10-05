# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, send_file
# pyrefly: ignore [missing-import]
from werkzeug.utils import secure_filename
from pathlib import Path
# pyrefly: ignore [missing-import]
from PIL import Image
from image_processor import read_excel, generate_images, create_zip
from video_processor import generate_videos, extract_first_frame
import uuid, os, datetime

app = Flask(__name__)
BASE = Path(__file__).resolve().parent
UPLOADS = BASE / "uploads"
OUTPUT = BASE / "output"
UPLOADS.mkdir(exist_ok=True)
OUTPUT.mkdir(exist_ok=True)

progress_tracker = {}

app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

@app.get("/progress/<session_id>")
def get_progress(session_id):
    return jsonify(progress_tracker.get(session_id, {"total": 0, "processed": 0, "success": 0, "failed": 0}))
@app.get("/")
def index():
    return render_template("index.html")

@app.post("/upload")
def upload():
    image = request.files.get("image")
    excel = request.files.get("excel")
    if not image or not excel:
        return jsonify({"error": "Please upload both image and Excel file."}), 400

    ext = Path(image.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov"}:
        return jsonify({"error": "Unsupported file format."}), 400
    if Path(excel.filename).suffix.lower() not in {".xlsx", ".xlsm", ".csv"}:
        return jsonify({"error": "Please upload an .xlsx, .xlsm, or .csv file."}), 400

    session_id = uuid.uuid4().hex
    session_dir = UPLOADS / session_id
    session_dir.mkdir()
    image_path = session_dir / ("template" + ext)
    excel_path = session_dir / secure_filename(excel.filename)
    image.save(image_path)
    excel.save(excel_path)

    try:
        columns, rows = read_excel(excel_path)
        
        preview_image_path = session_dir / "template.png"
        if ext in {".mp4", ".mov"}:
            success = extract_first_frame(image_path, preview_image_path)
            if not success:
                raise ValueError("Failed to extract preview frame from video.")
        else:
            with Image.open(image_path) as im:
                im.save(preview_image_path, "PNG")

        with Image.open(preview_image_path) as im:
            width, height = im.size
        return jsonify({
            "session_id": session_id,
            "columns": columns,
            "rows": len(rows),
            "image_width": width,
            "image_height": height,
            "preview_rows": rows,
            "is_video": ext in {".mp4", ".mov"},
            "ext": ext
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.get("/preview/<session_id>")
def preview(session_id):
    preview_path = UPLOADS / session_id / "template.png"
    if not preview_path.exists():
        return "Preview not found", 404
    return send_file(preview_path)

@app.get("/template_media/<session_id>")
def template_media(session_id):
    session_dir = UPLOADS / session_id
    if not session_dir.exists():
        return "Session not found", 404
    image_files = list(session_dir.glob("template.*"))
    if not image_files:
        return "Template not found", 404
    
    template_file = None
    for f in image_files:
        if f.name != "template.png":
            template_file = f
            break
    if not template_file:
        template_file = session_dir / "template.png"

    return send_file(template_file)

@app.post("/upload_logo")
def upload_logo():
    session_id = request.form.get("session_id")
    logo_file = request.files.get("logo_file")
    if not session_id or not logo_file:
        return jsonify({"error": "Missing session or file"}), 400
    
    session_dir = UPLOADS / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    
    logo_path = session_dir / "logo.png"
    logo_file.save(logo_path)
    return jsonify({"success": True})

@app.get("/get_logo/<session_id>")
def get_logo(session_id):
    logo_path = UPLOADS / session_id / "logo.png"
    if not logo_path.exists():
        return "Logo not found", 404
    return send_file(logo_path)

@app.post("/generate")
def generate():
    data = request.get_json(silent=True) or {}
    with open(OUTPUT / "debug_data.txt", "w") as f:
        import json
        f.write(json.dumps(data))
    
    sid = data.get("session_id")
    if not sid:
        return jsonify({"error": "Session not found."}), 400

    session_dir = UPLOADS / sid
    image_files = list(session_dir.glob("template.*"))
    excel_files = [p for p in session_dir.iterdir() if p.suffix.lower() in {".xlsx", ".xlsm", ".csv"}]
    if not image_files or not excel_files:
        return jsonify({"error": "Uploaded files not found."}), 404

    positions = data.get("positions", {})
    merged_sections = data.get("merged_sections", [])
    name_column = data.get("name_column")
    font_size = int(data.get("font_size", 40))
    color = data.get("color", "#111111")
    alignment = data.get("alignment", "center")

    try:
        columns, rows = read_excel(excel_files[0])
        if name_column not in columns:
            return jsonify({"error": "Selected name column does not exist."}), 400

        selected_indices = data.get("selected_indices")
        if selected_indices is not None:
            rows = [r for i, r in enumerate(rows) if i in selected_indices]

        if not rows:
            return jsonify({"error": "No rows selected."}), 400

        if merged_sections:
            for r in rows:
                for sec in merged_sections:
                    sec_id = sec.get("id")
                    cols = sec.get("cols", [])
                    sep = sec.get("separator", " | ")
                    if sec_id and cols:
                        vals = [str(r.get(c, '')).strip() for c in cols]
                        r[sec_id] = sep.join([v for v in vals if v])

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = OUTPUT / timestamp
        out_dir.mkdir(exist_ok=True)

        template_file = image_files[0]
        ext = template_file.suffix.lower()
        
        batch_size = data.get("batch_size")
        try:
            batch_size = int(batch_size) if batch_size else None
            if batch_size is not None and batch_size <= 0:
                batch_size = None
        except:
            batch_size = None

        batches = []
        if batch_size:
            for i in range(0, len(rows), batch_size):
                batches.append(rows[i:i+batch_size])
        else:
            batches = [rows]

        progress_tracker[sid] = {
            "total": len(rows), 
            "processed": 0, 
            "success": 0, 
            "failed": 0,
            "total_batches": len(batches),
            "current_batch": 1
        }
        
        global_success = 0
        global_failed = 0

        for b_idx, batch_rows in enumerate(batches):
            progress_tracker[sid]["current_batch"] = b_idx + 1
            
            # Save all media directly to the main output folder
            batch_dir = out_dir
            
            def batch_progress_callback(success_count, fail_count):
                progress_tracker[sid]["processed"] = global_success + global_failed + success_count + fail_count
                progress_tracker[sid]["success"] = global_success + success_count
                progress_tracker[sid]["failed"] = global_failed + fail_count

            if ext in {".mp4", ".mov"}:
                c = generate_videos(
                    template_file, batch_rows, batch_dir, positions,
                    name_column=name_column, alignment=alignment,
                    progress_callback=batch_progress_callback
                )
            else:
                c = generate_images(
                    template_file, batch_rows, batch_dir, positions,
                    name_column=name_column, alignment=alignment,
                    progress_callback=batch_progress_callback
                )
                
            global_success += c
            global_failed += (len(batch_rows) - c)
            
        # Zip all media
        media_zip_path = OUTPUT / f"{timestamp}_all_media.zip"
        create_zip(out_dir, media_zip_path)

        return jsonify({
            "count": global_success,
            "download_all_media": f"/download/{timestamp}_all_media",
            "is_video": ext in {".mp4", ".mov"}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.post("/generate_preview")
def generate_preview():
    data = request.get_json(silent=True) or {}
    sid = data.get("session_id")
    if not sid:
        return jsonify({"error": "Session not found."}), 400

    session_dir = UPLOADS / sid
    image_files = list(session_dir.glob("template.*"))
    excel_files = [p for p in session_dir.iterdir() if p.suffix.lower() in {".xlsx", ".xlsm", ".csv"}]
    if not image_files or not excel_files:
        return jsonify({"error": "Uploaded files not found."}), 404

    positions = data.get("positions", {})
    merged_sections = data.get("merged_sections", [])
    name_column = data.get("name_column")
    alignment = data.get("alignment", "center")

    try:
        columns, rows = read_excel(excel_files[0])
        if name_column not in columns:
            return jsonify({"error": "Selected name column does not exist."}), 400

        selected_indices = data.get("selected_indices")
        if selected_indices is not None:
            rows = [r for i, r in enumerate(rows) if i in selected_indices]

        if not rows:
            return jsonify({"error": "No rows selected."}), 400

        # Only use the first selected row for preview
        rows = rows[:1]

        if merged_sections:
            for r in rows:
                for sec in merged_sections:
                    sec_id = sec.get("id")
                    cols = sec.get("cols", [])
                    sep = sec.get("separator", " | ")
                    if sec_id and cols:
                        vals = [str(r.get(c, '')).strip() for c in cols]
                        r[sec_id] = sep.join([v for v in vals if v])

        out_dir = session_dir / "preview_gen"
        out_dir.mkdir(exist_ok=True)
        for f in out_dir.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass

        template_file = image_files[0]
        ext = template_file.suffix.lower()
        
        import time
        suffix = f"_preview_{int(time.time())}"
        
        if ext in {".mp4", ".mov"}:
            generate_videos(
                template_file, rows, out_dir, positions,
                name_column=name_column, alignment=alignment, suffix=suffix
            )
        else:
            generate_images(
                template_file, rows, out_dir, positions,
                name_column=name_column, alignment=alignment, suffix=suffix
            )
            
        generated_files = list(out_dir.glob("*"))
        if not generated_files:
            return jsonify({"error": "Failed to generate preview."}), 500
            
        return jsonify({
            "preview_url": f"/preview_file/{sid}/{generated_files[0].name}"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.get("/preview_file/<session_id>/<filename>")
def preview_file(session_id, filename):
    preview_path = UPLOADS / session_id / "preview_gen" / secure_filename(filename)
    if not preview_path.exists():
        return "Preview not found", 404
    return send_file(preview_path)

@app.get("/download/<folder_name>")
def download(folder_name):
    zip_path = OUTPUT / f"{folder_name}.zip"
    if not zip_path.exists():
        return "Generated file not found.", 404
    return send_file(zip_path, as_attachment=True, download_name=f"{folder_name}.zip")

@app.get("/download_batch_excel/<folder_name>/<filename>")
def download_batch_excel(folder_name, filename):
    file_path = OUTPUT / secure_filename(folder_name) / secure_filename(filename)
    if not file_path.exists():
        return "File not found.", 404
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.get("/download_batch_excel/<filename>")
def download_all_excel(filename):
    file_path = OUTPUT / secure_filename(filename)
    if not file_path.exists():
        return "File not found.", 404
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.post("/read_columns")
def read_columns():
    excel = request.files.get("excel")
    if not excel:
        return jsonify({"error": "No file uploaded"}), 400
    ext = Path(excel.filename).suffix.lower()
    if ext not in {".xlsx", ".xlsm", ".csv"}:
        return jsonify({"error": "Invalid format"}), 400
    
    temp_path = UPLOADS / (uuid.uuid4().hex + "_" + secure_filename(excel.filename))
    excel.save(temp_path)
    try:
        columns, _ = read_excel(temp_path)
        temp_path.unlink(missing_ok=True)
        return jsonify({"columns": columns})
    except Exception as e:
        temp_path.unlink(missing_ok=True)
        return jsonify({"error": str(e)}), 400

@app.post("/download_mapped_excel")
def download_mapped_excel():
    video_excel = request.files.get("videoGenExcel")
    data_excel = request.files.get("outputDataExcel")
    mapping_str = request.form.get("mapping")
    batch_size_str = request.form.get("batch_size")
    
    if not mapping_str:
        return jsonify({"error": "No mapping provided"}), 400
        
    import json
    import openpyxl
    mapping = json.loads(mapping_str)
    
    batch_size = None
    try:
        if batch_size_str:
            batch_size = int(batch_size_str)
            if batch_size <= 0: batch_size = None
    except:
        pass
    
    combined_rows = []
    
    def process_file(uploaded_file):
        if not uploaded_file: return [], []
        temp = UPLOADS / (uuid.uuid4().hex + "_" + secure_filename(uploaded_file.filename))
        uploaded_file.save(temp)
        try:
            cols, rows = read_excel(temp)
            temp.unlink(missing_ok=True)
            return cols, rows
        except:
            temp.unlink(missing_ok=True)
            return [], []

    v_cols, v_rows = process_file(video_excel)
    d_cols, d_rows = process_file(data_excel)
    
    max_len = max(len(v_rows), len(d_rows))
    for i in range(max_len):
        row_dict = {}
        if i < len(v_rows):
            row_dict.update(v_rows[i])
        if i < len(d_rows):
            row_dict.update(d_rows[i])
        combined_rows.append(row_dict)
        
    if not combined_rows:
        combined_rows = [{}]
        
    headers = [m["field"] for m in mapping]
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUTPUT / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)
    
    batches = []
    if batch_size:
        for i in range(0, len(combined_rows), batch_size):
            batches.append(combined_rows[i:i+batch_size])
    else:
        batches = [combined_rows]
        
    batch_responses = []
    
    for b_idx, batch_rows in enumerate(batches):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Mapped Data"
        ws.append(headers)
        
        for r in batch_rows:
            if not r and max_len == 0: continue
            row_data = []
            for m in mapping:
                col_name = m["column"]
                static_text = m["text"]
                if col_name and col_name in r:
                    row_data.append(r[col_name])
                else:
                    row_data.append(static_text)
            ws.append(row_data)
            
        base_name = "output_batch"
        if data_excel and data_excel.filename:
            base_name = Path(secure_filename(data_excel.filename)).stem
        elif video_excel and video_excel.filename:
            base_name = Path(secure_filename(video_excel.filename)).stem
            
        batch_num = f"{b_idx + 1:02d}"
        excel_name = f"{base_name}_{batch_num}.xlsx"
        excel_path = out_dir / excel_name
        wb.save(excel_path)
        
        start_idx = b_idx * (batch_size or len(combined_rows)) + 1
        end_idx = start_idx + len(batch_rows) - 1
        
        batch_responses.append({
            "batch_num": batch_num,
            "start": start_idx,
            "end": end_idx,
            "download_url": f"/download_batch_excel/{timestamp}/{excel_name}"
        })
        
    zip_all_path = OUTPUT / f"{timestamp}_all_excel.zip"
    create_zip(out_dir, zip_all_path)
    
    return jsonify({
        "batches": batch_responses,
        "download_all_excel": f"/download_batch_excel/{timestamp}_all_excel.zip"
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
