import re

def update_script_js():
    with open('static/script.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # Add globals
    if 'let mergedSections = [];' not in code:
        code = code.replace(
            'let previewData = [];',
            'let previewData = [];\nlet mergedSections = [];\nlet mergedCounter = 0;'
        )

    # 1. Inside updateOverlayUI(), add logic for merged sections text retrieval
    # Find the line: let sampleText = pickingCol;
    sync_logic = """
            let sampleText = pickingCol;
            
            if (pickingCol.startsWith('_merged_')) {
                const mergedDef = mergedSections.find(m => m.id === pickingCol);
                if (mergedDef && typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                    let selIndex = 0;
                    const checkedRows = document.querySelectorAll(".row-checkbox:checked");
                    if (checkedRows.length > 0) {
                        selIndex = Number(checkedRows[0].dataset.index) || 0;
                    }
                    if (selIndex >= previewData.length) selIndex = 0;
                    
                    const vals = mergedDef.cols.map(c => String(previewData[selIndex][c] || '').trim()).filter(v => v);
                    sampleText = vals.join(" | ");
                } else if (mergedDef) {
                    sampleText = mergedDef.label;
                }
            } else {
                if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                    let selIndex = 0;
                    const checkedRows = document.querySelectorAll(".row-checkbox:checked");
                    if (checkedRows.length > 0) {
                        selIndex = Number(checkedRows[0].dataset.index) || 0;
                    }
                    if (selIndex < previewData.length) {
                        sampleText = String(previewData[selIndex][pickingCol] || pickingCol).trim();
                    } else {
                        sampleText = String(previewData[0][pickingCol] || pickingCol).trim();
                    }
                }
            }
"""
    # Replace the old logic
    old_sync_logic = """            let sampleText = pickingCol;
            if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                let selIndex = 0;
                const checkedRows = document.querySelectorAll(".row-checkbox:checked");
                if (checkedRows.length > 0) {
                    selIndex = Number(checkedRows[0].dataset.index) || 0;
                }
                if (selIndex < previewData.length) {
                    sampleText = String(previewData[selIndex][pickingCol] || pickingCol).trim();
                } else {
                    sampleText = String(previewData[0][pickingCol] || pickingCol).trim();
                }
            }"""
    code = code.replace(old_sync_logic, sync_logic)

    # Do the same for syncActiveText (resize/draw handles)
    # Find: if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) { ... textLen = ... }
    sync_active_logic = """
                if (pickingCol.startsWith('_merged_')) {
                    const mergedDef = mergedSections.find(m => m.id === pickingCol);
                    if (mergedDef && typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                        const vals = mergedDef.cols.map(c => String(previewData[0][c] || '').trim()).filter(v => v);
                        textLen = Math.max(1, vals.join(" | ").length);
                    } else if (mergedDef) {
                        textLen = Math.max(1, mergedDef.label.length);
                    }
                } else if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
"""
    code = code.replace("if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) {", sync_active_logic, 1)

    # 2. Add merge panel population
    merge_pop = """
    $("nameColumn").innerHTML = columns.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    
    const mergeCheckboxesHTML = columns.map(c => `
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" class="merge-col-checkbox" value="${escapeHtml(c)}"> ${escapeHtml(c)}
      </label>
    `).join("");
    if ($("mergeColumnCheckboxes")) {
        $("mergeColumnCheckboxes").innerHTML = mergeCheckboxesHTML;
    }
"""
    code = code.replace('$("nameColumn").innerHTML = columns.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");', merge_pop)

    # 3. Add merge panel logic
    merge_logic = """
const getPositionRowHTML = (c, x, y, isVideo) => {
    return `<div class="position-row">
        <div class="pos-col-name">
            <input type="checkbox" class="col-checkbox" data-col="${escapeHtml(c)}" style="cursor: pointer; transform: scale(1.2);">
            <span>${escapeHtml(c)}</span>
        </div>
        <div class="pos-controls">
            <label class="pos-coord">X <input class="pos-x clean-input" data-col="${escapeHtml(c)}" type="number" value="${x}" style="width: 70px;"></label>
            <label class="pos-coord">Y <input class="pos-y clean-input" data-col="${escapeHtml(c)}" type="number" value="${y}" style="width: 70px;"></label>
            
            <div class="number-spinner">
                <button type="button" class="fs-btn fs-minus" data-col="${escapeHtml(c)}">−</button>
                <input class="pos-fs" data-col="${escapeHtml(c)}" type="number" value="40" style="width: 50px;">
                <button type="button" class="fs-btn fs-plus" data-col="${escapeHtml(c)}">+</button>
            </div>
            
            <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer;">
                <input type="checkbox" class="pos-bold" data-col="${escapeHtml(c)}"> Bold
            </label>
            
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                <input class="pos-color" data-col="${escapeHtml(c)}" type="color" value="#111111" title="Text Color">
            </div>
            
            <label class="pos-coord" style="margin-left: 8px;">Border 
                <input class="pos-border-width" data-col="${escapeHtml(c)}" type="number" step="0.1" value="0" min="0" style="width: 50px;" title="Border Size">
            </label>
            
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                <input class="pos-border-color" data-col="${escapeHtml(c)}" type="color" value="#ffffff" title="Border Color">
            </div>
            
            <button type="button" class="pick-btn" data-col="${escapeHtml(c)}" style="margin: 0; padding: 8px 16px; font-size: 13px; color: #fff;">🔲 Capture</button>
        </div>
        ${isVideo ? `
        <div class="pos-timing" style="display: flex; align-items: center; gap: 12px; margin-top: 10px; padding-left: 28px; font-size: 13px;">
            <label style="color: #475569; font-weight: 500;">Start: <input class="pos-start clean-input" data-col="${escapeHtml(c)}" type="text" value="00:00" style="width: 70px; margin-left: 4px;" placeholder="00:00"></label>
            <label style="color: #475569; font-weight: 500;">End: <input class="pos-end clean-input" data-col="${escapeHtml(c)}" type="text" value="" style="width: 70px; margin-left: 4px;" placeholder="End (e.g. 00:05)"></label>
            <span class="pos-duration" data-col="${escapeHtml(c)}" style="color: #64748b; font-weight: 500;">Duration: Full Video</span>
        </div>` : ''}
      </div>`;
};

if ($("openMergePanelBtn")) {
    $("openMergePanelBtn").onclick = () => {
        $("mergePanel").style.display = $("mergePanel").style.display === "none" ? "block" : "none";
    };
}

if ($("createMergedSectionBtn")) {
    $("createMergedSectionBtn").onclick = () => {
        const checked = Array.from(document.querySelectorAll(".merge-col-checkbox:checked")).map(cb => cb.value);
        if (checked.length < 2) {
            alert("Please select at least 2 columns to merge.");
            return;
        }
        
        mergedCounter++;
        const newId = "_merged_" + mergedCounter;
        const label = checked.join(" + ");
        mergedSections.push({ id: newId, label: label, cols: checked });
        
        const isVideo = $("templateVideoPreview") && $("templateVideoPreview").style.display !== "none";
        const html = getPositionRowHTML(newId, 500, 200, isVideo);
        
        // Append to positions
        $("positions").insertAdjacentHTML("beforeend", html);
        
        // Add event listeners to the new row
        const newRow = $("positions").lastElementChild;
        newRow.querySelector(".pick-btn").onclick = (e) => {
            pickingCol = e.target.dataset.col;
            $("selectionInfo").style.display = "block";
            $("selCol").textContent = pickingCol + " (Draw or adjust box...)";
            $("selX").textContent = "-";
            $("selY").textContent = "-";
            $("selW").textContent = "-";
            $("selH").textContent = "-";
            $("selFs").textContent = "-";
            if (typeof updateOverlayUI === "function") updateOverlayUI();
            $("imagePreviewCard").scrollIntoView({behavior: "smooth"});
        };
        
        // Uncheck the checkboxes and close panel
        document.querySelectorAll(".merge-col-checkbox").forEach(cb => cb.checked = false);
        $("mergePanel").style.display = "none";
    };
}
"""
    if 'getPositionRowHTML' not in code:
        code += "\n\n" + merge_logic

    # 4. Attach mergedSections to the payload
    # Find fetch("/generate" and fetch("/preview" and fetch("/preview_row"
    # Actually they are inside previewBtn, generateBtn, etc.
    # Look for body: JSON.stringify(payload)
    # The payload is built dynamically:
    # const payload = { session_id: sessionId, positions: activePositions, name_column: ... };
    
    payload_add = """
    // attach merged sections
    payload.merged_sections = mergedSections;
"""
    code = code.replace('const payload = {', 'const payload = {\n        merged_sections: mergedSections,')

    with open('static/script.js', 'w', encoding='utf-8') as f:
        f.write(code)

def update_app_py():
    with open('app.py', 'r', encoding='utf-8') as f:
        code = f.read()

    # /generate
    if 'merged_sections = data.get("merged_sections", [])' not in code:
        code = code.replace(
            'name_column = data.get("name_column")',
            'merged_sections = data.get("merged_sections", [])\n    name_column = data.get("name_column")'
        )
        code = code.replace(
            'zip_path = generate_images(excel_files[0], template_file, positions, name_column, font_size, color, out_dir, selected_indices)',
            'zip_path = generate_images(excel_files[0], template_file, positions, name_column, font_size, color, out_dir, selected_indices, merged_sections=merged_sections)'
        )
        code = code.replace(
            'zip_path = generate_videos(excel_files[0], template_file, positions, name_column, font_size, color, out_dir, selected_indices)',
            'zip_path = generate_videos(excel_files[0], template_file, positions, name_column, font_size, color, out_dir, selected_indices, merged_sections=merged_sections)'
        )
        
    # /preview
    if 'merged_sections = data.get("merged_sections", [])' not in code.split('def generate_preview():')[1]:
        code = code.replace(
            'positions = data.get("positions", {})',
            'positions = data.get("positions", {})\n    merged_sections = data.get("merged_sections", [])'
        )
        # Handle preview_row?
        # Actually /preview calls draw_text_on_image or draw_text_on_video directly.
        # Oh wait, /preview calls image_processor.draw_text_on_image(template_file, positions, font_size, color, row_data)
        # So we need to update those calls too.
        
        code = code.replace(
            'output_path = draw_text_on_image(template_file, positions, font_size, color, row_data)',
            'output_path = draw_text_on_image(template_file, positions, font_size, color, row_data, merged_sections=merged_sections)'
        )
        code = code.replace(
            'output_path = draw_text_on_video_ffmpeg(template_file, positions, font_size, color, row_data)',
            'output_path = draw_text_on_video_ffmpeg(template_file, positions, font_size, color, row_data, merged_sections=merged_sections)'
        )
        
    with open('app.py', 'w', encoding='utf-8') as f:
        f.write(code)

def update_image_processor():
    with open('image_processor.py', 'r', encoding='utf-8') as f:
        code = f.read()
        
    if 'merged_sections=None' not in code:
        code = code.replace(
            'def generate_images(excel_path, image_path, positions, name_column, base_font_size, base_color, output_dir, selected_indices=None):',
            'def generate_images(excel_path, image_path, positions, name_column, base_font_size, base_color, output_dir, selected_indices=None, merged_sections=None):'
        )
        code = code.replace(
            'def draw_text_on_image(image_path, positions, base_font_size, base_color, row_data, output_path=None):',
            'def draw_text_on_image(image_path, positions, base_font_size, base_color, row_data, output_path=None, merged_sections=None):'
        )
        
        # update drawing logic
        draw_logic = """
        is_watermark = (col_name == '_watermark')
        is_logo = (col_name == '_logo')
        
        if is_watermark:
            text = str(pos_data.get('text', ''))
        elif is_logo:
            text = ''
        elif col_name.startswith('_merged_') and merged_sections:
            merged_def = next((m for m in merged_sections if m['id'] == col_name), None)
            if merged_def:
                vals = [str(row_data.get(c, '')).strip() for c in merged_def['cols']]
                text = " | ".join([v for v in vals if v])
            else:
                text = ""
        else:
            text = str(row_data.get(col_name, ''))
"""
        code = code.replace(
            """
        is_watermark = (col_name == '_watermark')
        is_logo = (col_name == '_logo')
        if is_watermark:
            text = str(pos_data.get('text', ''))
        elif is_logo:
            text = ''
        else:
            text = str(row_data.get(col_name, ''))
""",
            draw_logic
        )
        
        code = code.replace(
            'output_path = draw_text_on_image(image_path, positions, base_font_size, base_color, row, output_path)',
            'output_path = draw_text_on_image(image_path, positions, base_font_size, base_color, row, output_path, merged_sections=merged_sections)'
        )

    with open('image_processor.py', 'w', encoding='utf-8') as f:
        f.write(code)

def update_video_processor():
    with open('video_processor.py', 'r', encoding='utf-8') as f:
        code = f.read()

    if 'merged_sections=None' not in code:
        code = code.replace(
            'def generate_videos(excel_path, video_path, positions, name_column, base_font_size, base_color, output_dir, selected_indices=None):',
            'def generate_videos(excel_path, video_path, positions, name_column, base_font_size, base_color, output_dir, selected_indices=None, merged_sections=None):'
        )
        code = code.replace(
            'def draw_text_on_video_ffmpeg(video_path, positions, base_font_size, base_color, row_data, output_path=None):',
            'def draw_text_on_video_ffmpeg(video_path, positions, base_font_size, base_color, row_data, output_path=None, merged_sections=None):'
        )
        
        # update drawing logic
        draw_logic = """
        is_watermark = (col_name == '_watermark')
        is_logo = (col_name == '_logo')
        
        if is_watermark:
            text = str(pos_data.get('text', ''))
        elif is_logo:
            text = ''
        elif col_name.startswith('_merged_') and merged_sections:
            merged_def = next((m for m in merged_sections if m['id'] == col_name), None)
            if merged_def:
                vals = [str(row_data.get(c, '')).strip() for c in merged_def['cols']]
                text = " | ".join([v for v in vals if v])
            else:
                text = ""
        else:
            text = str(row_data.get(col_name, ''))
"""
        code = code.replace(
            """
        is_watermark = (col_name == '_watermark')
        is_logo = (col_name == '_logo')
        if is_watermark:
            text = str(pos_data.get('text', ''))
        elif is_logo:
            text = ''
        else:
            text = str(row_data.get(col_name, ''))
""",
            draw_logic
        )

        code = code.replace(
            'output_path = draw_text_on_video_ffmpeg(video_path, positions, base_font_size, base_color, row, output_path)',
            'output_path = draw_text_on_video_ffmpeg(video_path, positions, base_font_size, base_color, row, output_path, merged_sections=merged_sections)'
        )

    with open('video_processor.py', 'w', encoding='utf-8') as f:
        f.write(code)

if __name__ == '__main__':
    update_script_js()
    update_app_py()
    update_image_processor()
    update_video_processor()
    print("Updates applied successfully.")
