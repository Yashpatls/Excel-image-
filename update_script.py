import re

with open("static/script.js", "r", encoding="utf-8") as f:
    content = f.read()

# Replace global fontSize logic
content = content.replace('let userFs = document.getElementById("fontSize") ? Number(document.getElementById("fontSize").value) : 40;', 
                          'let userFsInput = document.querySelector(`.pos-fs[data-col="${pickingCol.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n        let userFs = userFsInput ? Number(userFsInput.value) : 40;')

# Replace global fontSize logic for inactive overlays
content = content.replace('let userFs = document.getElementById("fontSize") ? Number(document.getElementById("fontSize").value) : 40;', 
                          'let userFsInput = document.querySelector(`.pos-fs[data-col="${col.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n                let userFs = userFsInput ? Number(userFsInput.value) : 40;')

# Replace global color logic for inactive overlays
content = content.replace('t.style.color = document.getElementById("color") ? document.getElementById("color").value : "#111111";',
                          'const cInp = document.querySelector(`.pos-color[data-col="${col.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n                t.style.color = cInp ? cInp.value : "#111111";\n                const bInp = document.querySelector(`.pos-bold[data-col="${col.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n                t.style.fontWeight = (bInp && bInp.checked) ? "bold" : "normal";')

# Replace global color logic for active overlay
content = content.replace('textDiv.style.color = document.getElementById("color") ? document.getElementById("color").value : "#111111";',
                          'const cInp = document.querySelector(`.pos-color[data-col="${pickingCol.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n        textDiv.style.color = cInp ? cInp.value : "#111111";\n        const bInp = document.querySelector(`.pos-bold[data-col="${pickingCol.replace(/\\"/g, \'\\\\\\\\\\"\')}"]`);\n        textDiv.style.fontWeight = (bInp && bInp.checked) ? "bold" : "normal";')


# Replace position generation
new_positions = """
    $("positions").innerHTML = columns.map((c, i) => {
      const x = Math.round((data.image_width || 1000) / 2);
      const y = 200 + i * 80;
      return `<div class="position-row" style="display: flex; flex-wrap: wrap; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
        <div style="flex: 1; min-width: 150px;">
            <input type="checkbox" class="col-checkbox" data-col="${escapeHtml(c)}" checked style="margin-right: 10px; cursor: pointer;">
            <strong>${escapeHtml(c)}</strong>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <label>X <input class="pos-x" data-col="${escapeHtml(c)}" type="number" value="${x}" style="width: 70px;"></label>
            <label>Y <input class="pos-y" data-col="${escapeHtml(c)}" type="number" value="${y}" style="width: 70px;"></label>
            <div style="display: flex; align-items: center; background: #fff; border: 1px solid #ccd4e0; border-radius: 6px; overflow: hidden;">
                <button type="button" class="fs-btn fs-minus" data-col="${escapeHtml(c)}" style="margin: 0; border-radius: 0; padding: 5px 10px; background: #f0f0f0; color: #333; cursor: pointer;">−</button>
                <input class="pos-fs" data-col="${escapeHtml(c)}" type="number" value="40" style="width: 50px; border: none; text-align: center; font-weight: bold; padding: 5px;">
                <button type="button" class="fs-btn fs-plus" data-col="${escapeHtml(c)}" style="margin: 0; border-radius: 0; padding: 5px 10px; background: #f0f0f0; color: #333; cursor: pointer;">+</button>
            </div>
            <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;"><input type="checkbox" class="pos-bold" data-col="${escapeHtml(c)}"> Bold</label>
            <input class="pos-color" data-col="${escapeHtml(c)}" type="color" value="#111111" style="padding: 0; height: 30px; width: 30px; cursor: pointer;">
            <button type="button" class="pick-btn" data-col="${escapeHtml(c)}" style="margin: 0; cursor: pointer;">🔲 Capture Area</button>
        </div>
      </div>`;
    }).join("");
"""
content = re.sub(r'\$\("positions"\)\.innerHTML = columns\.map\(\(c, i\) => \{.*?\}\)\.join\(""\);', new_positions, content, flags=re.DOTALL)

with open("static/script.js", "w", encoding="utf-8") as f:
    f.write(content)
