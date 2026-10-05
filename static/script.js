let sessionId = null;
let columns = [];
let previewData = [];
let mergedSections = [];
let mergedCounter = 0;

const $ = id => document.getElementById(id);

const parseTime = (str) => {
    if (!str) return null;
    str = str.trim();
    // If it contains a colon, parse as mm:ss
    if (str.includes(':')) {
        const pts = str.split(':');
        return (parseInt(pts[0])||0)*60 + (parseFloat(pts[1])||0);
    }
    // If it looks like mm.ss (e.g., 0.10), parse as mm:ss
    if (/^\d+\.\d{2}$/.test(str)) {
        const pts = str.split('.');
        return (parseInt(pts[0])||0)*60 + (parseFloat(pts[1])||0);
    }
    // Otherwise parse as plain seconds
    return parseFloat(str) || 0;
};

// Load saved settings
const savedColor = localStorage.getItem("textColor");
if (savedColor && savedColor.match(/^#[0-9a-fA-F]{6}$/) && $("color")) {
    $("color").value = savedColor;
} else if ($("color")) {
    $("color").value = "#111111"; // Force reset if broken
}

const savedFontSize = localStorage.getItem("fontSize");
if (savedFontSize && $("fontSize")) {
    $("fontSize").value = savedFontSize;
}

$("uploadBtn").onclick = async () => {
  const image = $("image").files[0];
  const excel = $("excel").files[0];
  if (!image || !excel) {
    $("uploadStatus").textContent = "Please select both files.";
    return;
  }

  const form = new FormData();
  form.append("image", image);
  form.append("excel", excel);
  $("uploadStatus").textContent = "Uploading and reading Data...";

  try {
    const res = await fetch("/upload", {method:"POST", body:form});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    sessionId = data.session_id;
    columns = data.columns;
    previewData = data.preview_rows;
    
    const imgPreviewEl = $("templatePreview");
    const vidPreviewEl = $("templateVideoPreview");
    let mediaPreview = imgPreviewEl;
    let getMediaWidth = () => mediaPreview.naturalWidth;
    let getMediaHeight = () => mediaPreview.naturalHeight;

    if (data.is_video) {
        imgPreviewEl.style.display = "none";
        vidPreviewEl.style.display = "block";
        vidPreviewEl.src = `/template_media/${sessionId}?t=${new Date().getTime()}`;
        mediaPreview = vidPreviewEl;
        getMediaWidth = () => mediaPreview.videoWidth;
        getMediaHeight = () => mediaPreview.videoHeight;
        mediaPreview.onloadeddata = () => {
            updateOverlayUI();
            document.querySelectorAll('.pos-start').forEach(el => el.dispatchEvent(new Event('input')));
        };
        
        // Handle showing/hiding text overlays based on current time
        mediaPreview.addEventListener("timeupdate", (e) => {
            const t = e.target.currentTime;
            document.querySelectorAll("#inactiveOverlaysContainer > div").forEach(box => {
                const col = box.dataset.col;
                if (!col) return;
                const safeCol = col.replace(/"/g, '\\"');
                const sStr = document.querySelector(`.pos-start[data-col="${safeCol}"]`)?.value;
                const eStr = document.querySelector(`.pos-end[data-col="${safeCol}"]`)?.value;
                const sTime = parseTime(sStr) || 0;
                const eTime = parseTime(eStr);
                
                if (eTime !== null && eTime !== 0 && eTime > sTime) {
                    if (t >= sTime && t <= eTime) {
                        box.style.opacity = "1";
                        box.style.pointerEvents = "auto";
                    } else {
                        box.style.opacity = "0";
                        box.style.pointerEvents = "none";
                    }
                } else {
                    box.style.opacity = "1";
                    box.style.pointerEvents = "auto";
                }
            });
        });
    } else {
        vidPreviewEl.style.display = "none";
        imgPreviewEl.style.display = "block";
        imgPreviewEl.src = `/preview/${sessionId}?t=${new Date().getTime()}`;
        mediaPreview = imgPreviewEl;
        getMediaWidth = () => mediaPreview.naturalWidth;
        getMediaHeight = () => mediaPreview.naturalHeight;
        mediaPreview.onload = () => updateOverlayUI();
    }

    
    
    $("nameColumn").innerHTML = columns.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    
    const mergeCheckboxesHTML = columns.map(c => `
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" class="merge-col-checkbox" value="${escapeHtml(c)}"> ${escapeHtml(c)}
      </label>
    `).join("");
    if ($("mergeColumnCheckboxes")) {
        $("mergeColumnCheckboxes").innerHTML = mergeCheckboxesHTML;
    }

    // Auto-select mobile number column if it exists
    const mobileCol = columns.find(c => {
        const lower = c.toLowerCase();
        return lower.includes("mobile") || lower.includes("phone") || lower.includes("contact") || lower.includes("whatsapp");
    });
    if (mobileCol) {
        $("nameColumn").value = mobileCol;
    }

    // Populate Add Column Checkboxes
    const singleColumnRadiosHTML = columns.map(c => `
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" class="add-col-checkbox" value="${escapeHtml(c)}"> ${escapeHtml(c)}
      </label>
    `).join("");
    if ($("singleColumnRadios")) {
        $("singleColumnRadios").innerHTML = singleColumnRadiosHTML;
    }
    
    // Start with empty positions
    $("positions").innerHTML = "";
    
    // Setup Image Preview for finding coordinates
    if (data.is_video) {
        document.querySelectorAll('.pos-start, .pos-end').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const col = e.target.dataset.col;
                const startStr = document.querySelector(`.pos-start[data-col="${col}"]`).value;
                const endStr = document.querySelector(`.pos-end[data-col="${col}"]`).value;
                const durSpan = document.querySelector(`.pos-duration[data-col="${col}"]`);
                
                const s = parseTime(startStr);
                const eTime = parseTime(endStr);
                
                let vidDur = null;
                if (mediaPreview && mediaPreview.tagName === 'VIDEO') {
                    vidDur = mediaPreview.duration;
                }
                
                if (s !== null && eTime !== null && eTime > s) {
                    if (vidDur !== null && !isNaN(vidDur) && eTime > vidDur) {
                        durSpan.textContent = `Duration: Exceeds video!`;
                        durSpan.style.color = '#ef4444';
                    } else {
                        durSpan.textContent = `Duration: ${(eTime - s).toFixed(1)}s`;
                        durSpan.style.color = '#10b981';
                    }
                } else if (!endStr) {
                    if (vidDur !== null && !isNaN(vidDur)) {
                        durSpan.textContent = `Duration: ${vidDur.toFixed(1)}s (Full Video)`;
                    } else {
                        durSpan.textContent = `Duration: Full Video`;
                    }
                    durSpan.style.color = '#64748b';
                } else {
                    durSpan.textContent = `Duration: Invalid`;
                    durSpan.style.color = '#ef4444';
                }
            });
        });
    }
    
    let pickingCol = null;
    
    // We'll create the overlay elements up front, but hide them initially
    // We'll create the overlay elements up front, but hide them initially
    const imgWrapper = $("imgWrapper");
    
    // Create full image center guidelines (Instagram snap style)
    const imgCenterLineV = document.createElement("div");
    imgCenterLineV.style.position = "absolute";
    imgCenterLineV.style.left = "50%";
    imgCenterLineV.style.top = "0";
    imgCenterLineV.style.width = "1px";
    imgCenterLineV.style.height = "100%";
    imgCenterLineV.style.backgroundColor = "#00ccff";
    imgCenterLineV.style.boxShadow = "0 0 4px #00ccff";
    imgCenterLineV.style.pointerEvents = "none";
    imgCenterLineV.style.zIndex = "5";
    imgCenterLineV.style.display = "none";
    
    const imgCenterLineH = document.createElement("div");
    imgCenterLineH.style.position = "absolute";
    imgCenterLineH.style.left = "0";
    imgCenterLineH.style.top = "50%";
    imgCenterLineH.style.width = "100%";
    imgCenterLineH.style.height = "1px";
    imgCenterLineH.style.backgroundColor = "#00ccff";
    imgCenterLineH.style.boxShadow = "0 0 4px #00ccff";
    imgCenterLineH.style.pointerEvents = "none";
    imgCenterLineH.style.zIndex = "5";
    imgCenterLineH.style.display = "none";
    
    imgWrapper.appendChild(imgCenterLineV);
    imgWrapper.appendChild(imgCenterLineH);
    
    const syncCenterLines = () => {
        if (!pickingCol || overlay.style.display === "none") {
            imgCenterLineV.style.display = "none";
            imgCenterLineH.style.display = "none";
            return;
        }
        
        const rect = mediaPreview.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const imgCenterX = rect.width / 2;
        const imgCenterY = rect.height / 2;
        
        const l = parseFloat(overlay.style.left) || 0;
        const t = parseFloat(overlay.style.top) || 0;
        const w = parseFloat(overlay.style.width) || 0;
        const h = parseFloat(overlay.style.height) || 0;
        
        const cx = l + (w / 2);
        const cy = t + (h / 2);
        
        if (Math.abs(cx - imgCenterX) < 1) {
            imgCenterLineV.style.display = "block";
            imgCenterLineV.style.left = imgCenterX + "px";
        } else {
            imgCenterLineV.style.display = "none";
        }
        
        if (Math.abs(cy - imgCenterY) < 1) {
            imgCenterLineH.style.display = "block";
            imgCenterLineH.style.top = imgCenterY + "px";
        } else {
            imgCenterLineH.style.display = "none";
        }
    };

    const syncActiveText = () => {
        if (!pickingCol || overlay.style.display === "none") return;
        
        const rect = mediaPreview.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const scaleX = getMediaWidth() / rect.width;
        const scaleY = getMediaHeight() / rect.height;
        const cssW = parseFloat(overlay.style.width) || 0;
        const cssH = parseFloat(overlay.style.height) || 0;
        const boxW = cssW * scaleX;
        const boxH = cssH * scaleY;
        
        const isWm = (pickingCol === '_watermark');
        let userFs = 40;
        let fsInput = null;
        
        if (isWm) {
            fsInput = document.getElementById("wmFs");
        } else {
            fsInput = document.querySelector(`.pos-fs[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
        }
        
        if (interactionMode === 'resize' || interactionMode === 'draw') {
            let textLen = 10;
            let rot = 0;
            if (isWm) {
                const wmText = document.getElementById("wmText");
                if (wmText) textLen = Math.max(1, wmText.value.length);
                const wmRot = document.getElementById("wmRotation");
                if (wmRot) rot = Number(wmRot.value) || 0;
            } else {
                
                if (pickingCol.startsWith('_merged_')) {
                    const mergedDef = mergedSections.find(m => m.id === pickingCol);
                    if (mergedDef && typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                        const vals = mergedDef.cols.map(c => String(previewData[0][c] || '').trim()).filter(v => v);
                        textLen = Math.max(1, vals.join(" | ").length);
                    } else if (mergedDef) {
                        textLen = Math.max(1, mergedDef.label.length);
                    }
                } else 
                if (pickingCol.startsWith('_merged_')) {
                    const mergedDef = mergedSections.find(m => m.id === pickingCol);
                    if (mergedDef && typeof previewData !== 'undefined' && previewData && previewData.length > 0) {
                        const vals = mergedDef.cols.map(c => String(previewData[0][c] || '').trim()).filter(v => v);
                        textLen = Math.max(1, vals.join(" | ").length);
                    } else if (mergedDef) {
                        textLen = Math.max(1, mergedDef.label.length);
                    }
                } else if (typeof previewData !== 'undefined' && previewData && previewData.length > 0) {


                    textLen = Math.max(1, String(previewData[0][pickingCol] || pickingCol).trim().length);
                } else {
                    textLen = Math.max(1, pickingCol.length);
                }
            }
            
            rot = ((rot % 360) + 360) % 360;
            const isVertical = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
            
            let effectiveW = boxW;
            let effectiveH = boxH;
            
            if (isVertical) {
                effectiveW = boxH;
                effectiveH = boxW;
            }
            
            const sizeByH = effectiveH * 0.8;
            const sizeByW = effectiveW / (textLen * 0.55);
            userFs = Math.max(8, Math.round(Math.min(sizeByH, sizeByW)));
            
            if (fsInput) fsInput.value = userFs;
            
            const selFsEl = document.getElementById("selFs");
            if (selFsEl) selFsEl.textContent = userFs;
        } else {
            if (fsInput) userFs = Number(fsInput.value) || 40;
        }
        
        const renderScaleY = rect.height / getMediaHeight();
        textDiv.style.fontSize = (userFs * renderScaleY) + "px";
    };

    const inactiveOverlaysContainer = document.createElement("div");
    inactiveOverlaysContainer.style.position = "absolute";
    inactiveOverlaysContainer.style.top = "0";
    inactiveOverlaysContainer.style.left = "0";
    inactiveOverlaysContainer.style.width = "100%";
    inactiveOverlaysContainer.style.height = "100%";
    inactiveOverlaysContainer.style.pointerEvents = "none";
    imgWrapper.appendChild(inactiveOverlaysContainer);

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.border = "2px dashed #0066cc";
    overlay.style.backgroundColor = "rgba(0, 102, 204, 0.2)";
    overlay.style.pointerEvents = "auto";
    overlay.style.display = "none";
    overlay.style.cursor = "move";
    imgWrapper.appendChild(overlay);

    const activeLabelDiv = document.createElement("div");
    activeLabelDiv.id = "activeLabelDiv";
    activeLabelDiv.style.position = "absolute";
    activeLabelDiv.style.top = "-22px";
    activeLabelDiv.style.left = "-2px";
    activeLabelDiv.style.background = "#0066cc";
    activeLabelDiv.style.color = "white";
    activeLabelDiv.style.padding = "2px 8px";
    activeLabelDiv.style.fontSize = "12px";
    activeLabelDiv.style.fontWeight = "bold";
    activeLabelDiv.style.borderRadius = "4px 4px 0 0";
    activeLabelDiv.style.pointerEvents = "none";
    activeLabelDiv.style.whiteSpace = "nowrap";
    overlay.appendChild(activeLabelDiv);

    const textDiv = document.createElement("div");
    textDiv.style.position = "absolute";
    textDiv.style.width = "100%";
    textDiv.style.height = "100%";
    textDiv.style.display = "flex";
    textDiv.style.justifyContent = "center"; 
    textDiv.style.alignItems = "center"; 
    textDiv.style.fontFamily = "sans-serif";
    textDiv.style.overflow = "visible";
    textDiv.style.whiteSpace = "normal";
    textDiv.style.wordBreak = "break-word";
    textDiv.style.textAlign = "center";
    textDiv.style.pointerEvents = "none";
    overlay.appendChild(textDiv);

    // Resize handles
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    const handleEls = {};
    handles.forEach(pos => {
      const h = document.createElement("div");
      h.style.position = "absolute";
      h.style.width = "10px";
      h.style.height = "10px";
      h.style.backgroundColor = "#fff";
      h.style.border = "1px solid #0066cc";
      h.style.pointerEvents = "auto";
      h.dataset.pos = pos;
      
      if (pos.includes('n')) h.style.top = "-5px";
      if (pos.includes('s')) h.style.bottom = "-5px";
      if (pos === 'e' || pos === 'w') h.style.top = "calc(50% - 5px)";
      if (pos.includes('w')) h.style.left = "-5px";
      if (pos.includes('e')) h.style.right = "-5px";
      if (pos === 'n' || pos === 's') h.style.left = "calc(50% - 5px)";
      
      h.style.cursor = pos + "-resize";
      overlay.appendChild(h);
      handleEls[pos] = h;
    });

    const getSampleText = (colName) => {
        if (!previewData || previewData.length === 0) return colName;
        
        if (colName.startsWith('_merged_')) {
            const section = mergedSections.find(s => s.id === colName);
            if (section) {
                const sep = typeof section.separator !== 'undefined' ? section.separator : " | ";
                return section.cols
                    .map(c => String(previewData[0][c] || "").trim())
                    .filter(val => val.length > 0)
                    .join(sep) || colName;
            }
        }
        return String(previewData[0][colName] || colName).trim();
    };

    const updateOverlayUI = () => {
        inactiveOverlaysContainer.innerHTML = "";
        const rect = mediaPreview.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // not loaded yet
        
        const scaleX = rect.width / getMediaWidth();
        const scaleY = rect.height / getMediaHeight();

        // Update pick-btn styles
        document.querySelectorAll(".pick-btn, #wmPickBtn, #logoPickBtn").forEach(btn => {
            let isActive = false;
            if (btn.id === 'wmPickBtn') isActive = (pickingCol === '_watermark');
            else if (btn.id === 'logoPickBtn') isActive = (pickingCol === '_logo');
            else isActive = (btn.dataset.col === pickingCol);

            if (isActive) {
                btn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
                btn.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
                btn.textContent = "✅ Active Area";
                btn.style.color = "#ffffff";
            } else {
                btn.style.background = "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
                btn.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)";
                btn.textContent = "🔲 Capture Area";
                btn.style.color = "#ffffff";
            }
        });

        // Draw all inactive boxes
        document.querySelectorAll(".col-checkbox").forEach(chk => {
            if (!chk.checked) return;
            
            const col = chk.dataset.col;
            if (col === pickingCol) return; // Handled separately
            
            const xInp = document.querySelector(`.pos-x[data-col="${col.replace(/"/g, '\\"')}"]`);
            const yInp = document.querySelector(`.pos-y[data-col="${col.replace(/"/g, '\\"')}"]`);
            if (!xInp || !yInp) return;
            
            const w = parseFloat(xInp.dataset.w);
            const h = parseFloat(xInp.dataset.h);
            const x = parseFloat(xInp.value);
            const y = parseFloat(yInp.value);
            
            if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                const box = document.createElement("div");
                box.dataset.col = col;
                box.style.position = "absolute";
                box.style.left = (x * scaleX) + "px";
                box.style.top = (y * scaleY) + "px";
                box.style.width = (w * scaleX) + "px";
                box.style.height = (h * scaleY) + "px";
                box.style.border = "2px solid rgba(150, 150, 150, 0.5)";
                box.style.backgroundColor = "rgba(200, 200, 200, 0.2)";
                box.style.pointerEvents = "auto";
                box.style.cursor = "pointer";
                box.style.transition = "opacity 0.2s";
                box.title = `Click to edit ${col}`;
                box.onclick = (e) => {
                    e.stopPropagation();
                    const btn = document.querySelector(`.pick-btn[data-col="${col.replace(/"/g, '\\"')}"]`);
                    if (btn) btn.click();
                };
                
                const t = document.createElement("div");
                t.style.width = "100%";
                t.style.height = "100%";
                t.style.display = "flex";
                
                const alignInp = document.querySelector(`.pos-align[data-col="${col.replace(/"/g, '\\"')}"]`);
                const alignVal = alignInp ? alignInp.value : "center";
                if (alignVal === "left") {
                    t.style.justifyContent = "flex-start";
                    t.style.textAlign = "left";
                } else if (alignVal === "right") {
                    t.style.justifyContent = "flex-end";
                    t.style.textAlign = "right";
                } else {
                    t.style.justifyContent = "center";
                    t.style.textAlign = "center";
                }
                
                t.style.alignItems = "center";
                const cInp = document.querySelector(`.pos-color[data-col="${col.replace(/"/g, '\\"')}"]`);
                t.style.color = cInp ? cInp.value : "#111111";
                const bInp = document.querySelector(`.pos-bold[data-col="${col.replace(/"/g, '\\"')}"]`);
                t.style.fontWeight = (bInp && bInp.checked) ? "bold" : "normal";
                t.style.fontFamily = "sans-serif";
                t.style.pointerEvents = "none";
                t.style.overflow = "hidden";
                
                let sampleText = getSampleText(col);
                t.textContent = sampleText;
                
                let userFsInput = document.querySelector(`.pos-fs[data-col="${col.replace(/"/g, '\\"')}"]`);
                let userFs = userFsInput ? Number(userFsInput.value) : 40;
                let origFs = userFs;
                t.style.fontSize = (origFs * scaleY) + "px";
                
                const bwInp = document.querySelector(`.pos-border-width[data-col="${col.replace(/"/g, '\\"')}"]`);
                const bcInp = document.querySelector(`.pos-border-color[data-col="${col.replace(/"/g, '\\"')}"]`);
                const bw = bwInp ? Number(bwInp.value) : 0;
                const bc = bcInp ? bcInp.value : "#ffffff";
                
                if (bw > 0) {
                    const strokeW = bw * scaleY;
                    t.style.webkitTextStroke = `${strokeW}px ${bc}`;
                } else {
                    t.style.webkitTextStroke = "0px";
                }
                
                // Need to append first to calculate scroll dimensions
                box.appendChild(t);
                inactiveOverlaysContainer.appendChild(box);
            }
        });

        // Draw watermark box if enabled
        const wmEnable = document.getElementById("wmEnable");
        if (wmEnable && wmEnable.checked && pickingCol !== '_watermark') {
            const wxInp = document.getElementById("wmX");
            const wyInp = document.getElementById("wmY");
            if (wxInp && wyInp) {
                const w = parseFloat(document.getElementById("wmW").value);
                const h = parseFloat(document.getElementById("wmH").value);
                const x = parseFloat(wxInp.value);
                const y = parseFloat(wyInp.value);
                
                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                    const box = document.createElement("div");
                    box.style.position = "absolute";
                    box.style.left = (x * scaleX) + "px";
                    box.style.top = (y * scaleY) + "px";
                    box.style.width = (w * scaleX) + "px";
                    box.style.height = (h * scaleY) + "px";
                    box.style.border = "2px solid rgba(150, 150, 150, 0.5)";
                    box.style.backgroundColor = "rgba(200, 200, 200, 0.2)";
                    box.style.pointerEvents = "auto";
                    box.style.cursor = "pointer";
                    box.title = "Click to edit Watermark";
                    box.onclick = () => {
                        const btn = document.getElementById("wmPickBtn");
                        if(btn) btn.click();
                    };
                    
                    const t = document.createElement("div");
                    t.style.width = "100%";
                    t.style.height = "100%";
                    t.style.display = "flex";
                    t.style.justifyContent = "center";
                    t.style.alignItems = "center";
                    t.style.color = document.getElementById("wmColor").value;
                    t.style.fontFamily = "sans-serif";
                    t.style.pointerEvents = "none";
                    t.style.overflow = "hidden";
                    
                    t.textContent = document.getElementById("wmText").value;
                    
                    let userFs = Number(document.getElementById("wmFs").value) || 40;
                    t.style.fontSize = (userFs * scaleY) + "px";
                    
                    let rot = Number(document.getElementById("wmRotation").value) || 0;
                    t.style.transform = `rotate(${rot}deg)`;
                    
                    let op = Number(document.getElementById("wmOpacity").value) ?? 100;
                    t.style.opacity = op / 100;
                    
                    box.appendChild(t);
                    inactiveOverlaysContainer.appendChild(box);
                }
            }
        }

        const logoEnable = document.getElementById("logoEnable");
        if (logoEnable && logoEnable.checked && pickingCol !== '_logo') {
            const lxInp = document.getElementById("logoX");
            const lyInp = document.getElementById("logoY");
            if (lxInp && lyInp) {
                const w = parseFloat(document.getElementById("logoW").value);
                const h = parseFloat(document.getElementById("logoH").value);
                const x = parseFloat(lxInp.value);
                const y = parseFloat(lyInp.value);
                
                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                    const box = document.createElement("div");
                    box.style.position = "absolute";
                    box.style.left = (x * scaleX) + "px";
                    box.style.top = (y * scaleY) + "px";
                    box.style.width = (w * scaleX) + "px";
                    box.style.height = (h * scaleY) + "px";
                    box.style.border = "2px dashed rgba(0, 102, 204, 0.5)";
                    box.style.backgroundColor = "rgba(0, 102, 204, 0.1)";
                    box.style.pointerEvents = "auto";
                    box.style.cursor = "pointer";
                    box.title = "Click to edit Logo";
                    box.onclick = () => {
                        const btn = document.getElementById("logoPickBtn");
                        if(btn) btn.click();
                    };
                    
                    let op = Number(document.getElementById("logoOpacity").value) ?? 100;
                    box.innerHTML = `<img src="/get_logo/${sessionId}" style="width:100%; height:100%; object-fit:contain; opacity:${op/100}; pointer-events:none;">`;
                    
                    inactiveOverlaysContainer.appendChild(box);
                }
            }
        }

        if (!pickingCol) {
            overlay.style.display = "none";
            return;
        }
        
        let xInput, yInput, w, h, x, y;
        if (pickingCol === '_logo') {
            xInput = document.getElementById("logoX");
            yInput = document.getElementById("logoY");
            w = parseFloat(document.getElementById("logoW").value);
            h = parseFloat(document.getElementById("logoH").value);
            x = parseFloat(xInput.value);
            y = parseFloat(yInput.value);
        } else if (pickingCol === '_watermark') {
            xInput = document.getElementById("wmX");
            yInput = document.getElementById("wmY");
            w = parseFloat(document.getElementById("wmW").value);
            h = parseFloat(document.getElementById("wmH").value);
            x = parseFloat(xInput.value);
            y = parseFloat(yInput.value);
        } else {
            xInput = document.querySelector(`.pos-x[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            yInput = document.querySelector(`.pos-y[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            if (!xInput || !yInput) return;
            w = parseFloat(xInput.dataset.w);
            h = parseFloat(xInput.dataset.h);
            x = parseFloat(xInput.value);
            y = parseFloat(yInput.value);
        }
        
        const activeLabelDiv = document.getElementById("activeLabelDiv");
        if (activeLabelDiv) {
            let labelText = pickingCol;
            if (pickingCol === '_logo') labelText = 'Logo';
            if (pickingCol === '_watermark') labelText = 'Watermark';
            activeLabelDiv.textContent = labelText;
        }

        if (pickingCol === '_logo') {
            let op = Number(document.getElementById("logoOpacity").value) ?? 100;
            textDiv.innerHTML = `<img src="/get_logo/${sessionId}" style="width:100%; height:100%; object-fit:contain; opacity:${op/100}; pointer-events:none;">`;
            textDiv.style.transform = "none";
            textDiv.style.opacity = "1";
        } else if (pickingCol === '_watermark') {
            textDiv.innerHTML = "";
            textDiv.style.wordBreak = "normal";
            textDiv.style.whiteSpace = "pre";
            textDiv.style.color = document.getElementById("wmColor").value;
            textDiv.style.fontWeight = "normal";
            textDiv.textContent = document.getElementById("wmText").value;
            let userFs = Number(document.getElementById("wmFs").value) || 40;
            textDiv.style.fontSize = (userFs * scaleY) + "px";
            let rot = Number(document.getElementById("wmRotation").value) || 0;
            textDiv.style.transform = `rotate(${rot}deg)`;
            let op = Number(document.getElementById("wmOpacity").value) ?? 100;
            textDiv.style.opacity = op / 100;
            textDiv.style.webkitTextStroke = "0px";
        } else {
            textDiv.innerHTML = "";
            textDiv.style.wordBreak = "break-word";
            textDiv.style.whiteSpace = "pre-wrap";
            const cInp = document.querySelector(`.pos-color[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            textDiv.style.color = cInp ? cInp.value : "#111111";
            const bInp = document.querySelector(`.pos-bold[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            textDiv.style.fontWeight = (bInp && bInp.checked) ? "bold" : "normal";

            const alignInp = document.querySelector(`.pos-align[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            const alignVal = alignInp ? alignInp.value : "center";
            if (alignVal === "left") {
                textDiv.style.justifyContent = "flex-start";
                textDiv.style.textAlign = "left";
            } else if (alignVal === "right") {
                textDiv.style.justifyContent = "flex-end";
                textDiv.style.textAlign = "right";
            } else {
                textDiv.style.justifyContent = "center";
                textDiv.style.textAlign = "center";
            }

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
                    const sep = typeof mergedDef.separator !== 'undefined' ? mergedDef.separator : " | ";
                    sampleText = vals.join(sep);
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

            textDiv.textContent = sampleText;
            
            let userFsInput = document.querySelector(`.pos-fs[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            let userFs = userFsInput ? Number(userFsInput.value) : 40;
            textDiv.style.fontSize = (userFs * scaleY) + "px";
            textDiv.style.transform = "none";
            textDiv.style.opacity = 1;
            
            const bwInp = document.querySelector(`.pos-border-width[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            const bcInp = document.querySelector(`.pos-border-color[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            const bw = bwInp ? Number(bwInp.value) : 0;
            const bc = bcInp ? bcInp.value : "#ffffff";
            
            if (bw > 0) {
                const strokeW = bw * scaleY;
                textDiv.style.webkitTextStroke = `${strokeW}px ${bc}`;
            } else {
                textDiv.style.webkitTextStroke = "0px";
            }
        }

        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
            overlay.style.display = "none";
            return; // Needs drawing
        }
        
        overlay.style.left = (x * scaleX) + "px";
        overlay.style.top = (y * scaleY) + "px";
        overlay.style.width = (w * scaleX) + "px";
        overlay.style.height = (h * scaleY) + "px";
        overlay.style.display = "block";
        
        // Text content and activeLabelDiv are now updated above the return early check.
        
        const selColEl = document.getElementById("selCol");
        if (selColEl) selColEl.textContent = pickingCol === '_watermark' ? 'Watermark' : (pickingCol === '_logo' ? 'Logo' : pickingCol);
        
        const selX = document.getElementById("selX");
        if (selX) selX.textContent = Math.round(x);
        const selY = document.getElementById("selY");
        if (selY) selY.textContent = Math.round(y);
        const selW = document.getElementById("selW");
        if (selW) selW.textContent = Math.round(w);
        const selH = document.getElementById("selH");
        if (selH) selH.textContent = Math.round(h);
        const selFsEl = document.getElementById("selFs");
        if (selFsEl) {
            let fs = 40;
            if (pickingCol === '_watermark') fs = Number(document.getElementById("wmFs").value) || 40;
            else {
                let fi = document.querySelector(`.pos-fs[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
                if (fi) fs = fi.value;
            }
            selFsEl.textContent = fs;
        }
        
        syncCenterLines();
    };

    document.querySelectorAll(".pick-btn").forEach(btn => {
      btn.onclick = (e) => {
        pickingCol = e.target.dataset.col;
        
        $("selectionInfo").style.display = "block";
        $("selCol").textContent = pickingCol + " (Draw or adjust box...)";
        $("selX").textContent = "-";
        $("selY").textContent = "-";
        $("selW").textContent = "-";
        $("selH").textContent = "-";
        $("selFs").textContent = "-";
        
        updateOverlayUI();
        $("imagePreviewCard").scrollIntoView({behavior: "smooth"});
      };
    });

    $("table").innerHTML = makeTable(data.preview_rows);
    const selectAllBtn = $("selectAllRows");
    if (selectAllBtn) {
      selectAllBtn.onchange = (e) => {
        document.querySelectorAll(".row-checkbox").forEach(cb => cb.checked = e.target.checked);
      };
    }
    
    // Setup Image Preview for finding coordinates
    // src and onload/onloadeddata are now handled earlier

    let interactionMode = null; // 'draw', 'drag', 'resize'
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0, initialWidth = 0, initialHeight = 0;
    let resizeHandle = null;

    const commitBox = () => {
        if (!pickingCol) return;
        const rect = mediaPreview.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const scaleX = getMediaWidth() / rect.width;
        const scaleY = getMediaHeight() / rect.height;
        
        const boxX = Math.round(parseFloat(overlay.style.left) * scaleX);
        const boxY = Math.round(parseFloat(overlay.style.top) * scaleY);
        const boxW = Math.round(parseFloat(overlay.style.width) * scaleX);
        const boxH = Math.round(parseFloat(overlay.style.height) * scaleY);
        
        const calculateOptimalFs = (isWm) => {
            let textLen = 10;
            let rot = 0;
            if (isWm) {
                const wmText = document.getElementById("wmText");
                if (wmText) textLen = Math.max(1, wmText.value.length);
                const wmRot = document.getElementById("wmRotation");
                if (wmRot) rot = Number(wmRot.value) || 0;
            } else {
                textLen = Math.max(1, getSampleText(pickingCol).length);
            }
            
            // Normalize rotation to 0-360
            rot = ((rot % 360) + 360) % 360;
            // Check if rotation is mostly vertical (close to 90 or 270)
            const isVertical = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
            
            let effectiveW = boxW;
            let effectiveH = boxH;
            
            if (isVertical) {
                effectiveW = boxH;
                effectiveH = boxW;
            }
            
            const sizeByH = effectiveH * 0.8;
            const sizeByW = effectiveW / (textLen * 0.55);
            return Math.max(8, Math.round(Math.min(sizeByH, sizeByW)));
        };
        
        if (pickingCol === '_watermark') {
            const wmX = document.getElementById("wmX");
            const wmY = document.getElementById("wmY");
            const wmW = document.getElementById("wmW");
            const wmH = document.getElementById("wmH");
            if (wmX) wmX.value = boxX;
            if (wmY) wmY.value = boxY;
            if (wmW) wmW.value = boxW;
            if (wmH) wmH.value = boxH;
            
            const fsInput = document.getElementById("wmFs");
            if (fsInput && (interactionMode === 'draw' || interactionMode === 'resize')) {
                fsInput.value = calculateOptimalFs(true);
            }
            
            const wmEnable = document.getElementById("wmEnable");
            if (wmEnable && !wmEnable.checked) {
                wmEnable.checked = true;
                wmEnable.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else if (pickingCol === '_logo') {
            const lxInput = document.getElementById("logoX");
            const lyInput = document.getElementById("logoY");
            const lwInput = document.getElementById("logoW");
            const lhInput = document.getElementById("logoH");
            if (lxInput) lxInput.value = boxX;
            if (lyInput) lyInput.value = boxY;
            if (lwInput) lwInput.value = boxW;
            if (lhInput) lhInput.value = boxH;
            
            const logoEnable = document.getElementById("logoEnable");
            if (logoEnable && !logoEnable.checked) {
                logoEnable.checked = true;
                logoEnable.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            const xInput = document.querySelector(`.pos-x[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            const yInput = document.querySelector(`.pos-y[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            if (xInput && yInput) {
                xInput.value = boxX;
                yInput.value = boxY;
                xInput.dataset.w = boxW;
                xInput.dataset.h = boxH;
            }
            
            const fsInput = document.querySelector(`.pos-fs[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            if (fsInput && (interactionMode === 'draw' || interactionMode === 'resize')) {
                fsInput.value = calculateOptimalFs(false);
            }
            
            const chk = document.querySelector(`.col-checkbox[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
            if (chk && !chk.checked) {
                chk.checked = true;
                chk.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        updateOverlayUI();
    };

    // Drawing a new box on the image
    mediaPreview.onmousedown = (e) => {
        if (!pickingCol) return;
        e.preventDefault(); // stop drag image
        
        interactionMode = 'draw-pending';
        const rect = mediaPreview.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
    };

    // Interacting with the existing box
    overlay.onmousedown = (e) => {
        if (!pickingCol) return;
        e.preventDefault();
        e.stopPropagation();
        
        const rect = mediaPreview.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        
        initialLeft = parseFloat(overlay.style.left) || 0;
        initialTop = parseFloat(overlay.style.top) || 0;
        initialWidth = parseFloat(overlay.style.width) || 0;
        initialHeight = parseFloat(overlay.style.height) || 0;

        if (e.target.dataset.pos) {
            interactionMode = 'resize';
            resizeHandle = e.target.dataset.pos;
        } else {
            interactionMode = 'drag';
        }
    };

    document.addEventListener("mousemove", (e) => {
        if (!interactionMode) return;
        const rect = mediaPreview.getBoundingClientRect();
        let currX = e.clientX - rect.left;
        let currY = e.clientY - rect.top;
        currX = Math.max(0, Math.min(rect.width, currX));
        currY = Math.max(0, Math.min(rect.height, currY));
        
        if (interactionMode === 'draw-pending') {
            if (Math.abs(currX - startX) > 3 || Math.abs(currY - startY) > 3) {
                interactionMode = 'draw';
                overlay.style.left = startX + "px";
                overlay.style.top = startY + "px";
                overlay.style.width = "0px";
                overlay.style.height = "0px";
                overlay.style.display = "block";
            } else {
                return;
            }
        }
        
        if (interactionMode === 'draw') {
            overlay.style.left = Math.min(startX, currX) + "px";
            overlay.style.top = Math.min(startY, currY) + "px";
            overlay.style.width = Math.abs(currX - startX) + "px";
            overlay.style.height = Math.abs(currY - startY) + "px";
        } else if (interactionMode === 'drag') {
            let dx = currX - startX;
            let dy = currY - startY;
            
            // Lock axis if Shift key is held
            if (e.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    dy = 0; // Lock horizontally
                } else {
                    dx = 0; // Lock vertically
                }
            }
            
            let newL = initialLeft + dx;
            let newT = initialTop + dy;
            
            const w = parseFloat(overlay.style.width) || 0;
            const h = parseFloat(overlay.style.height) || 0;
            
            // Snap to center
            const snapThreshold = 10;
            const imgCenterX = rect.width / 2;
            const imgCenterY = rect.height / 2;
            const boxCenterX = newL + (w / 2);
            const boxCenterY = newT + (h / 2);
            
            if (Math.abs(boxCenterX - imgCenterX) < snapThreshold) {
                newL = imgCenterX - (w / 2);
            }
            if (Math.abs(boxCenterY - imgCenterY) < snapThreshold) {
                newT = imgCenterY - (h / 2);
            }
            
            // Constrain
            newL = Math.max(0, Math.min(rect.width - initialWidth, newL));
            newT = Math.max(0, Math.min(rect.height - initialHeight, newT));
            
            overlay.style.left = newL + "px";
            overlay.style.top = newT + "px";
        } else if (interactionMode === 'resize') {
            let dx = currX - startX;
            let dy = currY - startY;
            
            let newL = initialLeft;
            let newT = initialTop;
            let newW = initialWidth;
            let newH = initialHeight;

            if (resizeHandle.includes('e')) newW = initialWidth + dx;
            if (resizeHandle.includes('w')) {
                newL = initialLeft + dx;
                newW = initialWidth - dx;
            }
            if (resizeHandle.includes('s')) newH = initialHeight + dy;
            if (resizeHandle.includes('n')) {
                newT = initialTop + dy;
                newH = initialHeight - dy;
            }
            
            if (newW < 10) { newW = 10; if (resizeHandle.includes('w')) newL = initialLeft + initialWidth - 10; }
            if (newH < 10) { newH = 10; if (resizeHandle.includes('n')) newT = initialTop + initialHeight - 10; }
            
            // Constrain
            if (newL < 0) { newW += newL; newL = 0; }
            if (newT < 0) { newH += newT; newT = 0; }
            if (newL + newW > rect.width) newW = rect.width - newL;
            if (newT + newH > rect.height) newH = rect.height - newT;
            
            overlay.style.left = newL + "px";
            overlay.style.top = newT + "px";
            overlay.style.width = newW + "px";
            overlay.style.height = newH + "px";
        }
        
        syncCenterLines();
        syncActiveText();
    });

    document.addEventListener("mouseup", (e) => {
        if (interactionMode === 'draw-pending') {
            interactionMode = null;
            // User clicked the image but didn't drag. This means they want to exit capture mode.
            pickingCol = null;
            updateOverlayUI();
            const selInfo = document.getElementById("selectionInfo");
            if (selInfo) selInfo.style.display = "none";
            document.querySelectorAll(".pick-btn, #wmPickBtn, #logoPickBtn").forEach(b => {
                b.style.background = "";
                b.textContent = "🔲 Capture Area";
                b.style.color = "";
                b.style.boxShadow = "";
            });
            return;
        }
        if (interactionMode) {
            const wasDraw = (interactionMode === 'draw');
            commitBox();
            interactionMode = null;
            resizeHandle = null;
            
            // We no longer auto-stop capture mode here so the user can immediately adjust their newly drawn box.
            
            if (imgCenterLineV) imgCenterLineV.style.display = "none";
            if (imgCenterLineH) imgCenterLineH.style.display = "none";
        }
    });

    // Wire up Watermark Settings Live Preview
    const wmEnable = document.getElementById("wmEnable");
    if (wmEnable) {
        wmEnable.onchange = () => {
            document.getElementById("wmControls").style.display = wmEnable.checked ? "flex" : "none";
            if (!wmEnable.checked && pickingCol === '_watermark') {
                pickingCol = null;
            }
            updateOverlayUI();
        };
    }

    const wireWmSetting = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.oninput = () => {
                if (pickingCol === '_watermark') syncActiveText();
                updateOverlayUI();
            };
        }
    };
    wireWmSetting("wmText");
    wireWmSetting("wmFs");
    wireWmSetting("wmOpacity");
    wireWmSetting("wmRotation");
    wireWmSetting("wmColor");

    const wireWmBtn = (btnId, inputId, delta) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.onclick = () => {
                const inp = document.getElementById(inputId);
                if (inp) {
                    let val = Number(inp.value) || 0;
                    val += delta;
                    if (inputId === 'wmOpacity') {
                        val = Math.max(0, Math.min(100, val));
                    } else if (inputId === 'wmFs') {
                        val = Math.max(8, val);
                    }
                    inp.value = val;
                    if (pickingCol === '_watermark') syncActiveText();
                    updateOverlayUI();
                }
            };
        }
    };
    wireWmBtn("wmFsMinus", "wmFs", -1);
    wireWmBtn("wmFsPlus", "wmFs", 1);
    wireWmBtn("wmOpMinus", "wmOpacity", -5);
    wireWmBtn("wmOpPlus", "wmOpacity", 5);
    wireWmBtn("wmRotMinus", "wmRotation", -5);
    wireWmBtn("wmRotPlus", "wmRotation", 5);

    const wmPickBtn = document.getElementById("wmPickBtn");
    if (wmPickBtn) {
        wmPickBtn.onclick = () => {
            pickingCol = '_watermark';
            const selInfo = document.getElementById("selectionInfo");
            if (selInfo) selInfo.style.display = "block";
            const selCol = document.getElementById("selCol");
            if (selCol) selCol.textContent = "Watermark (Draw or adjust box...)";
            
            updateOverlayUI();
            const previewCard = document.getElementById("imagePreviewCard");
            if (previewCard) previewCard.scrollIntoView({behavior: "smooth"});
        };
    }

    const setupPositionListeners = (containerId) => {
        const container = $(containerId);
        if (!container) return;

        container.addEventListener("input", (e) => {
            if (e.target.matches(".pos-fs") || e.target.matches(".pos-align") || e.target.matches(".pos-x") || e.target.matches(".pos-y") || e.target.matches(".pos-color") || e.target.matches(".pos-bold") || e.target.matches(".pos-border-width") || e.target.matches(".pos-border-color")) {
                updateOverlayUI();
            }
            if (e.target.matches(".pos-start") || e.target.matches(".pos-end")) {
                const timingDiv = e.target.closest('.pos-timing');
                if (timingDiv) {
                    const stInp = timingDiv.querySelector('.pos-start');
                    const etInp = timingDiv.querySelector('.pos-end');
                    const durSpan = timingDiv.querySelector('.pos-duration');
                    if (stInp && durSpan) {
                        const s = parseTime(stInp.value);
                        const endStr = etInp ? etInp.value : '';
                        const eTime = parseTime(endStr);
                        let vidDur = null;
                        const mediaPreview = $("templateVideoPreview");
                        if (mediaPreview && mediaPreview.tagName === 'VIDEO') {
                            vidDur = mediaPreview.duration;
                        }
                        if (s !== null && eTime !== null && eTime > s) {
                            if (vidDur !== null && !isNaN(vidDur) && eTime > vidDur) {
                                durSpan.textContent = `Duration: Exceeds video!`;
                                durSpan.style.color = '#ef4444';
                            } else {
                                durSpan.textContent = `Duration: ${(eTime - s).toFixed(1)}s`;
                                durSpan.style.color = '#10b981';
                            }
                        } else if (!endStr) {
                            if (vidDur !== null && !isNaN(vidDur)) {
                                durSpan.textContent = `Duration: ${vidDur.toFixed(1)}s (Full Video)`;
                            } else {
                                durSpan.textContent = `Duration: Full Video`;
                            }
                        } else {
                            durSpan.textContent = `Duration: Invalid`;
                            durSpan.style.color = '#ef4444';
                        }
                    }
                }
            }
        });
        
        container.addEventListener("change", (e) => {
            if (e.target.matches(".col-checkbox")) {
                const col = e.target.dataset.col;
                if (!e.target.checked && pickingCol === col) {
                    // If the active column is deselected, exit capture mode
                    pickingCol = null;
                    const selInfo = document.getElementById("selectionInfo");
                    if (selInfo) selInfo.style.display = "none";
                    const overlay = document.getElementById("overlay");
                    if (overlay) overlay.style.display = "none";
                    if (imgCenterLineV) imgCenterLineV.style.display = "none";
                    if (imgCenterLineH) imgCenterLineH.style.display = "none";
                }
                updateOverlayUI();
            }
        });

        container.addEventListener("click", (e) => {
            const removeBtn = e.target.closest('.remove-row-btn');
            if (removeBtn) {
                const col = removeBtn.dataset.col;
                const row = removeBtn.closest('.position-row');
                if (row) {
                    row.remove();
                    if (pickingCol === col) {
                        pickingCol = null;
                        const selInfo = document.getElementById("selectionInfo");
                        if (selInfo) selInfo.style.display = "none";
                        const overlay = document.getElementById("overlay");
                        if (overlay) overlay.style.display = "none";
                    }
                    updateOverlayUI();
                }
                return;
            }

            const addTimingBtn = e.target.closest('.add-timing-btn');
            if (addTimingBtn) {
                const c = addTimingBtn.dataset.col;
                const container = addTimingBtn.closest('.timings-container');
                if (container) {
                    const newHtml = `
                    <div class="pos-timing" style="display: flex; align-items: center; gap: 12px; font-size: 13px; margin-top: 8px;">
                        <label style="color: #475569; font-weight: 500;">Start: <input class="pos-start clean-input" data-col="${escapeHtml(c)}" type="text" value="00:00" style="width: 70px; margin-left: 4px;" placeholder="00:00"></label>
                        <label style="color: #475569; font-weight: 500;">End: <input class="pos-end clean-input" data-col="${escapeHtml(c)}" type="text" value="" style="width: 70px; margin-left: 4px;" placeholder="End (e.g. 00:05)"></label>
                        <span class="pos-duration" data-col="${escapeHtml(c)}" style="color: #64748b; font-weight: 500;">Duration: Full Video</span>
                        <button type="button" class="remove-timing-btn" style="background: none; border: none; color: #ef4444; font-size: 14px; cursor: pointer;" title="Remove this time segment">❌</button>
                    </div>`;
                    container.insertAdjacentHTML('beforeend', newHtml);
                }
                return;
            }
            
            const removeTimingBtn = e.target.closest('.remove-timing-btn');
            if (removeTimingBtn) {
                const timingDiv = removeTimingBtn.closest('.pos-timing');
                if (timingDiv) timingDiv.remove();
                return;
            }

            if (e.target.matches(".pick-btn")) {
                pickingCol = e.target.dataset.col;
                
                // Automatically select the checkbox for this column
                const chk = document.querySelector(`.col-checkbox[data-col="${pickingCol.replace(/"/g, '\\"')}"]`);
                if (chk && !chk.checked) {
                    chk.checked = true;
                }

                const selInfo = document.getElementById("selectionInfo");
                if (selInfo) selInfo.style.display = "block";
                const selCol = document.getElementById("selCol");
                if (selCol) {
                    let label = pickingCol;
                    if (pickingCol.startsWith('_merged_')) {
                        const m = mergedSections.find(x => x.id === pickingCol);
                        if (m) label = m.label;
                    }
                    selCol.textContent = label + " (Draw or adjust box...)";
                }
                updateOverlayUI();
                const previewCard = document.getElementById("imagePreviewCard");
                if (previewCard) previewCard.scrollIntoView({behavior: "smooth"});
            }
        });
    };

    setupPositionListeners("positions");
    setupPositionListeners("mergedPositions");
    
    const logoEnable = document.getElementById("logoEnable");
    if(logoEnable) {
        logoEnable.addEventListener("change", (e) => {
            document.getElementById("logoControls").style.display = e.target.checked ? "flex" : "none";
            if (!e.target.checked && pickingCol === '_logo') {
                pickingCol = null;
            }
            updateOverlayUI();
        });
    }
    
    const logoPickBtn = document.getElementById("logoPickBtn");
    if(logoPickBtn) {
        logoPickBtn.addEventListener("click", () => {
            pickingCol = '_logo';
            updateOverlayUI();
        });
    }
    
    const logoFile = document.getElementById("logoFile");
    if(logoFile) {
        logoFile.addEventListener("change", async (e) => {
            const f = e.target.files[0];
            if (!f || !sessionId) return;
            const fd = new FormData();
            fd.append("session_id", sessionId);
            fd.append("logo_file", f);
            try {
                const res = await fetch("/upload_logo", {method:"POST", body:fd});
                const j = await res.json();
                if (j.success) {
                    updateOverlayUI();
                    drawInactiveOverlays();
                }
            } catch(err) {
                console.error(err);
            }
        });
    }
    
    const logoOpInp = document.getElementById("logoOpacity");
    const logoOpPlus = document.getElementById("logoOpPlus");
    const logoOpMinus = document.getElementById("logoOpMinus");
    if(logoOpInp) {
        logoOpInp.addEventListener("input", () => { updateOverlayUI(); drawInactiveOverlays(); });
        logoOpPlus.addEventListener("click", () => { logoOpInp.value = Math.min(100, (Number(logoOpInp.value)||0) + 10); updateOverlayUI(); drawInactiveOverlays(); });
        logoOpMinus.addEventListener("click", () => { logoOpInp.value = Math.max(0, (Number(logoOpInp.value)||0) - 10); updateOverlayUI(); drawInactiveOverlays(); });
    }

    const navCapture = document.getElementById("navCapture");
    if (navCapture) {
        navCapture.disabled = false;
        navCapture.title = "";
        navCapture.click();
    }
    $("uploadStatus").textContent = `Loaded ${data.rows} data rows. Image size: ${data.image_width} × ${data.image_height}px.`;
    previewData = data.preview_rows;
    
    
    // Monitor row checkbox changes
    document.getElementById("table").addEventListener("change", (e) => {
        if(e.target.id === "selectAllRows") {
            const isChecked = e.target.checked;
            document.querySelectorAll(".row-checkbox").forEach(cb => {
                cb.checked = isChecked;
            });
            updateBatchInfo();
        } else if(e.target.matches(".row-checkbox")) {
            // Update selectAll checkbox state
            const allBoxes = document.querySelectorAll(".row-checkbox");
            const allChecked = Array.from(allBoxes).every(cb => cb.checked);
            const selectAllBox = document.getElementById("selectAllRows");
            if(selectAllBox) selectAllBox.checked = allChecked;
            updateBatchInfo();
        }
    });
  } catch(e) {
    $("uploadStatus").textContent = e.message;
  }
};

$("generateBtn").onclick = async () => {
  if (!sessionId) return;
  const positions = {};
  document.querySelectorAll(".col-checkbox:checked").forEach(chk => {
    const c = chk.dataset.col;
    positions[c] = {};
    const rowDiv = chk.closest('.position-row');
    if (rowDiv && rowDiv.dataset.sourceCol) {
        positions[c].source_col = rowDiv.dataset.sourceCol;
    }
    const safeC = c.replace(/"/g, '\\"');
    const xEl = document.querySelector(`.pos-x[data-col="${safeC}"]`);
    const yEl = document.querySelector(`.pos-y[data-col="${safeC}"]`);
    const fsEl = document.querySelector(`.pos-fs[data-col="${safeC}"]`);
    const colorEl = document.querySelector(`.pos-color[data-col="${safeC}"]`);
    const boldEl = document.querySelector(`.pos-bold[data-col="${safeC}"]`);
    const bwEl = document.querySelector(`.pos-border-width[data-col="${safeC}"]`);
    const bcEl = document.querySelector(`.pos-border-color[data-col="${safeC}"]`);
    const alignEl = document.querySelector(`.pos-align[data-col="${safeC}"]`);
    const startEl = document.querySelector(`.pos-start[data-col="${safeC}"]`);
    const endEl = document.querySelector(`.pos-end[data-col="${safeC}"]`);

    if (xEl) {
      positions[c].x = Number(xEl.value);
      if (xEl.dataset.w) positions[c].w = Number(xEl.dataset.w);
      if (xEl.dataset.h) positions[c].h = Number(xEl.dataset.h);
    }
    if (yEl) {
      positions[c].y = Number(yEl.value);
    }
    if (fsEl) positions[c].font_size = Number(fsEl.value) || 40;
    if (colorEl) positions[c].color = colorEl.value || "#111111";
    if (boldEl) positions[c].bold = boldEl.checked;
    if (bwEl) positions[c].border_width = Number(bwEl.value) || 0;
    if (bcEl) positions[c].border_color = bcEl.value || "#ffffff";
    if (alignEl) positions[c].alignment = alignEl.value || "center";
    
    const timings = [];
    if (rowDiv) {
        rowDiv.querySelectorAll('.pos-timing').forEach(tDiv => {
            const st = tDiv.querySelector('.pos-start');
            const et = tDiv.querySelector('.pos-end');
            if (st || et) {
                const startVal = st ? parseTime(st.value) : 0;
                const endVal = et && et.value ? parseTime(et.value) : null;
                timings.push({start_time: startVal, end_time: endVal});
            }
        });
    }
    positions[c].timings = timings;
    if (timings.length > 0) {
        positions[c].start_time = timings[0].start_time;
        positions[c].end_time = timings[0].end_time;
    }
  });

  const wmEnable = document.getElementById("wmEnable");
  if (wmEnable && wmEnable.checked) {
      positions['_watermark'] = {
          x: Number(document.getElementById("wmX").value),
          y: Number(document.getElementById("wmY").value),
          w: Number(document.getElementById("wmW").value),
          h: Number(document.getElementById("wmH").value),
          text: document.getElementById("wmText").value,
          font_size: Number(document.getElementById("wmFs").value),
          opacity: Number(document.getElementById("wmOpacity").value),
          rotation: Number(document.getElementById("wmRotation").value),
          color: document.getElementById("wmColor").value
      };
  }

  const logoEnable = document.getElementById("logoEnable");
  if (logoEnable && logoEnable.checked) {
      positions['_logo'] = {
          x: Number(document.getElementById("logoX").value),
          y: Number(document.getElementById("logoY").value),
          w: Number(document.getElementById("logoW").value),
          h: Number(document.getElementById("logoH").value),
          opacity: Number(document.getElementById("logoOpacity").value)
      };
  }

  const selectedIndices = [];
  document.querySelectorAll(".row-checkbox:checked").forEach(cb => {
    selectedIndices.push(Number(cb.dataset.index));
  });

  if (selectedIndices.length === 0) {
    $("generateStatus").textContent = "Please select at least one row.";
    return;
  }

  const batchSizeInput = document.getElementById("batchSize");
  const batchSize = batchSizeInput ? Number(batchSizeInput.value) : null;

  let totalRows = selectedIndices.length;
  let estimatedBatches = batchSize && batchSize > 0 ? Math.ceil(totalRows / batchSize) : 1;

  $("generateStatus").innerHTML = `<div id="progressBox">Generating files...<br>Total Batches: ${estimatedBatches}<br>Progress: 0%<br>Processed: 0 / ?<br>Success: 0 | Failed: 0</div>`;
  
  const progressTimer = setInterval(async () => {
    try {
      const pRes = await fetch(`/progress/${sessionId}`);
      const pData = await pRes.json();
      const pct = pData.total > 0 ? Math.round((pData.processed / pData.total) * 100) : 0;
      const box = document.getElementById("progressBox");
      if(box) {
         let txt = `Generating files...<br>`;
         if (pData.total_batches) {
             txt += `Batch: ${pData.current_batch || 1} / ${pData.total_batches}<br>`;
         }
         txt += `Progress: ${pct}%<br>Processed: ${pData.processed} / ${pData.total}<br>Success: ${pData.success} | Failed: ${pData.failed}`;
         box.innerHTML = txt;
      }
    } catch(e) {}
  }, 1000);

  try {
    const res = await fetch("/generate", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        session_id: sessionId,
        name_column: $("nameColumn").value,
        alignment: "center",
        positions,
        merged_sections: mergedSections,
        selected_indices: selectedIndices,
        batch_size: batchSize
      })
    });
    clearInterval(progressTimer);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");
    const typeStr = data.is_video ? "videos" : "images";
    
    $("generateStatus").innerHTML = `<div style="margin-top: 15px; padding: 15px; background-color: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; color: #2e7d32; display: flex; align-items: center; justify-content: space-between;">
        <span>Successfully generated <b>${data.count}</b> ${typeStr}.</span>
        <a href="${data.download_all_media || data.download}" download style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">⬇️ Download All Media ZIP</a>
    </div>`;

    const bDownloads = document.getElementById("batchDownloads");
    const bList = document.getElementById("batchList");
    const btnAll = document.getElementById("downloadAllBtn");
    
    if (bDownloads && bList && data.batches && data.batches.length > 0) {
        bList.innerHTML = "";
        data.batches.forEach(b => {
            const div = document.createElement("div");
            div.style.padding = "10px";
            div.style.background = "#fff";
            div.style.border = "1px solid #ddd";
            div.style.borderRadius = "5px";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            
            div.innerHTML = `
                <div>
                    <strong>Batch ${b.batch_num}</strong><br>
                    <small>Rows: ${b.start}–${b.end}</small>
                </div>
                <a href="${b.download_url}" download style="background-color: #17a2b8; color: white; padding: 5px 15px; text-decoration: none; border-radius: 4px; font-size: 14px;">⬇️ Download</a>
            `;
            bList.appendChild(div);
        });
        
        if (btnAll && data.download_all_excel) {
            btnAll.onclick = () => {
                window.location.href = data.download_all_excel;
            };
        }
        bDownloads.style.display = "block";
    } else if (bDownloads) {
        bDownloads.style.display = "none";
    }
  } catch(e) {
    clearInterval(progressTimer);
    $("generateStatus").textContent = e.message;
  }
};

const previewBtn = $("previewBtn");
if (previewBtn) {
    previewBtn.onclick = async () => {
      if (!sessionId) return;
      const positions = {};
      document.querySelectorAll(".col-checkbox:checked").forEach(chk => {
        const c = chk.dataset.col;
        positions[c] = {};
        const rowDiv = chk.closest('.position-row');
        if (rowDiv && rowDiv.dataset.sourceCol) {
            positions[c].source_col = rowDiv.dataset.sourceCol;
        }
        const safeC = c.replace(/"/g, '\\"');
        const xEl = document.querySelector(`.pos-x[data-col="${safeC}"]`);
        const yEl = document.querySelector(`.pos-y[data-col="${safeC}"]`);
        const fsEl = document.querySelector(`.pos-fs[data-col="${safeC}"]`);
        const colorEl = document.querySelector(`.pos-color[data-col="${safeC}"]`);
        const boldEl = document.querySelector(`.pos-bold[data-col="${safeC}"]`);
        const bwEl = document.querySelector(`.pos-border-width[data-col="${safeC}"]`);
        const bcEl = document.querySelector(`.pos-border-color[data-col="${safeC}"]`);
        const alignEl = document.querySelector(`.pos-align[data-col="${safeC}"]`);
        const startEl = document.querySelector(`.pos-start[data-col="${safeC}"]`);
        const endEl = document.querySelector(`.pos-end[data-col="${safeC}"]`);

        if (xEl) {
          positions[c].x = Number(xEl.value);
          if (xEl.dataset.w) positions[c].w = Number(xEl.dataset.w);
          if (xEl.dataset.h) positions[c].h = Number(xEl.dataset.h);
        }
        if (yEl) {
          positions[c].y = Number(yEl.value);
        }
        if (fsEl) positions[c].font_size = Number(fsEl.value) || 40;
        if (colorEl) positions[c].color = colorEl.value || "#111111";
        if (boldEl) positions[c].bold = boldEl.checked;
        if (bwEl) positions[c].border_width = Number(bwEl.value) || 0;
        if (bcEl) positions[c].border_color = bcEl.value || "#ffffff";
        if (alignEl) positions[c].alignment = alignEl.value || "center";
        
        const timings = [];
        if (rowDiv) {
            rowDiv.querySelectorAll('.pos-timing').forEach(tDiv => {
                const st = tDiv.querySelector('.pos-start');
                const et = tDiv.querySelector('.pos-end');
                if (st || et) {
                    const startVal = st ? parseTime(st.value) : 0;
                    const endVal = et && et.value ? parseTime(et.value) : null;
                    timings.push({start_time: startVal, end_time: endVal});
                }
            });
        }
        positions[c].timings = timings;
        if (timings.length > 0) {
            positions[c].start_time = timings[0].start_time;
            positions[c].end_time = timings[0].end_time;
        }
      });

      const wmEnable = document.getElementById("wmEnable");
      if (wmEnable && wmEnable.checked) {
          positions['_watermark'] = {
              x: Number(document.getElementById("wmX").value),
              y: Number(document.getElementById("wmY").value),
              w: Number(document.getElementById("wmW").value),
              h: Number(document.getElementById("wmH").value),
              text: document.getElementById("wmText").value,
              font_size: Number(document.getElementById("wmFs").value),
              opacity: Number(document.getElementById("wmOpacity").value),
              rotation: Number(document.getElementById("wmRotation").value),
              color: document.getElementById("wmColor").value
          };
      }

      const logoEnable = document.getElementById("logoEnable");
      if (logoEnable && logoEnable.checked) {
          positions['_logo'] = {
              x: Number(document.getElementById("logoX").value),
              y: Number(document.getElementById("logoY").value),
              w: Number(document.getElementById("logoW").value),
              h: Number(document.getElementById("logoH").value),
              opacity: Number(document.getElementById("logoOpacity").value)
          };
      }

      const selectedIndices = [];
      document.querySelectorAll(".row-checkbox:checked").forEach(cb => {
        selectedIndices.push(Number(cb.dataset.index));
      });

      if (selectedIndices.length === 0) {
        $("generateStatus").textContent = "Please select at least one row for preview.";
        return;
      }

      $("generateStatus").textContent = "Generating preview...";
      try {
        const res = await fetch("/generate_preview", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            session_id: sessionId,
            name_column: $("nameColumn").value,
            alignment: "center",
            positions,
            merged_sections: mergedSections,
            selected_indices: selectedIndices
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Preview Generation failed");
        
        $("generateStatus").textContent = "Preview ready!";
        $("previewResult").style.display = "block";
        const container = $("previewMediaContainer");
        
        const timestamp = new Date().getTime();
        const url = `${data.preview_url}?t=${timestamp}`;
        
        if (url.toLowerCase().includes(".mp4") || url.toLowerCase().includes(".mov")) {
            container.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:500px; border:1px solid #ccc;"></video>`;
        } else {
            container.innerHTML = `<img src="${url}" style="max-width:100%; max-height:500px; border:1px solid #ccc;">`;
        }
        
        $("previewResult").scrollIntoView({behavior: "smooth"});
      } catch(e) {
        $("generateStatus").textContent = e.message;
      }
    };
}

function makeTable(rows) {
  if (!rows || !rows.length) return "No preview data.";
  const keys = Object.keys(rows[0]);
  return `<div class="table-wrap"><table><thead><tr>
    <th><input type="checkbox" id="selectAllRows" checked></th>
    ${keys.map(k=>`<th>${escapeHtml(k)}</th>`).join("")}
  </tr></thead><tbody>${
    rows.map((r, i)=>`<tr>
      <td><input type="checkbox" class="row-checkbox" data-index="${i}" checked></td>
      ${keys.map(k=>`<td>${escapeHtml(r[k])}</td>`).join("")}
    </tr>`).join("")
  }</tbody></table></div>`;
}
function escapeHtml(s){return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return String(s).replace(/[^a-zA-Z0-9_-]/g,"_");}

function escapeHtml(unsafe) {
    return (unsafe || "").toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Section 4 Excel column fetching
async function handleReadSection4ExcelFiles() {
    const btn = document.getElementById("readSection4Btn");
    const originalText = btn.innerText;
    btn.innerText = "Reading Files...";
    btn.disabled = true;

    try {
        const videoGenExcelInp = document.getElementById("videoGenExcel");
        const outputDataExcelInp = document.getElementById("outputDataExcel");

        const videoFile = videoGenExcelInp.files[0];
        const outputFile = outputDataExcelInp.files[0];

        if (!outputFile) {
            alert("Please upload the Output File Label excel first!");
            return;
        }

        // Read Output File first to create rows
        const outForm = new FormData();
        outForm.append("excel", outputFile);
        
        const outRes = await fetch("/read_columns", {method: "POST", body: outForm});
        const outData = await outRes.json();
        
        if (outData.error) {
            alert("Error reading Output File: " + outData.error);
            return;
        }

        if (outData.columns) {
            const tbody = document.querySelector("#excelMapping table tbody");
            if (!tbody) {
                alert("Internal error: Could not find table body in HTML.");
                return;
            }
            
            let optionsHtml = "<option value=''>--Select Column--</option>";
            let newHtml = "";
            outData.columns.forEach(col => {
                newHtml += `
                <tr>
                  <td style="width: 30px;"><input type="checkbox" class="sec4-row-checkbox" checked style="cursor: pointer;"></td>
                  <th style="width: 120px;">${escapeHtml(col)}</th>
                  <td>
                    <select class="excel-dropdown">${optionsHtml}</select>
                    <span style="margin: 0 10px;">/</span>
                    <input type="text" class="excel-text" placeholder="">
                  </td>
                </tr>`;
            });
            tbody.innerHTML = newHtml;
        }

        // Read Video Gen Excel second to populate dropdowns
        if (videoFile) {
            const vidForm = new FormData();
            vidForm.append("excel", videoFile);
            
            const vidRes = await fetch("/read_columns", {method: "POST", body: vidForm});
            const vidData = await vidRes.json();
            
            if (vidData.error) {
                alert("Error reading Video Generated Excel: " + vidData.error);
            } else if (vidData.columns) {
                const dropdowns = document.querySelectorAll(".excel-dropdown");
                dropdowns.forEach(dd => {
                    let optionsHtml = "<option value=''>--Select Column--</option>";
                    const rowTh = dd.closest("tr").querySelector("th");
                    const targetName = rowTh ? rowTh.innerText.trim() : "";
                    
                    vidData.columns.forEach(c => {
                        const isMatch = c.trim() === targetName ? "selected" : "";
                        optionsHtml += `<option value="${escapeHtml(c)}" ${isMatch}>${escapeHtml(c)}</option>`;
                    });
                    
                    dd.innerHTML = optionsHtml;
                });
            }
        }
    } catch (err) {
        console.error(err);
        alert("A critical error occurred while reading the files: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        if (typeof updateSec4BatchInfo === "function") {
            updateSec4BatchInfo();
        }
    }
}

const readSection4Btn = document.getElementById("readSection4Btn");
if (readSection4Btn) {
    readSection4Btn.addEventListener("click", handleReadSection4ExcelFiles);
}

function updateSec4BatchInfo() {
    const bSizeInp = document.getElementById("sec4BatchSize");
    const info = document.getElementById("sec4BatchInfo");
    if(bSizeInp && info) {
        const rows = document.querySelectorAll("#excelMapping table tr").length;
        const totalRows = rows > 0 ? rows - 1 : 0; // subtract header
        const bSize = Number(bSizeInp.value) || 0;
        if(bSize > 0) {
            const batches = Math.ceil(totalRows / bSize);
            info.innerHTML = `Total Rows: ${totalRows}<br>Batch Size: ${bSize}<br>Total Batches: ${batches}`;
        } else {
            info.innerHTML = `Total Rows: ${totalRows}<br>No batching applied.`;
        }
    }
};

const applySec4BatchBtn = document.getElementById("applySec4BatchBtn");
if(applySec4BatchBtn) applySec4BatchBtn.onclick = updateSec4BatchInfo;
const sec4BatchSizeInp = document.getElementById("sec4BatchSize");
if(sec4BatchSizeInp) sec4BatchSizeInp.addEventListener("input", updateSec4BatchInfo);

const downloadExcelBtn = document.getElementById("downloadExcelBtn");
if (downloadExcelBtn) {
    downloadExcelBtn.addEventListener("click", async () => {
        const mapping = [];
        const rows = document.querySelectorAll("#excelMapping table tr");
        rows.forEach(row => {
            const cb = row.querySelector(".sec4-row-checkbox");
            if (cb && !cb.checked) return;
            
            const th = row.querySelector("th");
            const select = row.querySelector("select");
            const input = row.querySelector("input[type='text']");
            if (th && select && input) {
                mapping.push({
                    field: th.innerText.trim(),
                    column: select.value,
                    text: input.value
                });
            }
        });

        const videoGenExcelInp = document.getElementById("videoGenExcel");
        const outputDataExcelInp = document.getElementById("outputDataExcel");
        const batchSizeInp = document.getElementById("sec4BatchSize");

        const form = new FormData();
        if (videoGenExcelInp && videoGenExcelInp.files[0]) form.append("videoGenExcel", videoGenExcelInp.files[0]);
        if (outputDataExcelInp && outputDataExcelInp.files[0]) form.append("outputDataExcel", outputDataExcelInp.files[0]);
        form.append("mapping", JSON.stringify(mapping));
        if (batchSizeInp && batchSizeInp.value) form.append("batch_size", batchSizeInp.value);
        
        const originalText = downloadExcelBtn.innerText;
        downloadExcelBtn.innerText = "Generating...";
        downloadExcelBtn.disabled = true;

        try {
            const res = await fetch("/download_mapped_excel", { method: "POST", body: form });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to generate Excel");
            }
            
            const data = await res.json();
            const bDownloads = document.getElementById("sec4BatchDownloads");
            const bList = document.getElementById("sec4BatchList");
            const btnAll = document.getElementById("sec4DownloadAllBtn");
            
            if (bDownloads && bList && data.batches && data.batches.length > 0) {
                bList.innerHTML = "";
                data.batches.forEach(b => {
                    const div = document.createElement("div");
                    div.style.padding = "10px";
                    div.style.background = "#f9f9f9";
                    div.style.border = "1px solid #ddd";
                    div.style.borderRadius = "5px";
                    div.style.display = "flex";
                    div.style.justifyContent = "space-between";
                    div.style.alignItems = "center";
                    
                    div.innerHTML = `
                        <div>
                            <strong>Batch ${b.batch_num}</strong><br>
                            <small>Rows: ${b.start}–${b.end}</small>
                        </div>
                        <a href="${b.download_url}" download style="background-color: #17a2b8; color: white; padding: 5px 15px; text-decoration: none; border-radius: 4px; font-size: 14px;">⬇️ Download</a>
                    `;
                    bList.appendChild(div);
                });
                
                if (btnAll && data.download_all_excel) {
                    btnAll.onclick = () => {
                        window.location.href = data.download_all_excel;
                    };
                }
                bDownloads.style.display = "block";
            }
        } catch(err) {
            alert("Error: " + err.message);
        } finally {
            downloadExcelBtn.innerText = originalText;
            downloadExcelBtn.disabled = false;
        }
    });
}

const showDataPreviewCheck = document.getElementById("showDataPreviewCheck");
if (showDataPreviewCheck) {
    showDataPreviewCheck.addEventListener("change", (e) => {
        const table = document.getElementById("table");
        if (table) {
            table.style.display = e.target.checked ? "block" : "none";
        }
    });
}

const sec4SelectAll = document.getElementById("sec4SelectAll");
if (sec4SelectAll) {
    sec4SelectAll.addEventListener("change", (e) => {
        const checkboxes = document.querySelectorAll(".sec4-row-checkbox");
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
    });
}



const getPositionRowHTML = (c, x, y, isVideo, label, sourceCol) => {
    const displayLabel = label || c;
    const sCol = sourceCol || c;
    return `<div class="position-row" data-source-col="${escapeHtml(sCol)}" data-label="${escapeHtml(displayLabel)}">
        <div class="pos-col-name" style="display: flex; align-items: center; gap: 8px; justify-content: space-between; padding-right: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" class="col-checkbox" data-col="${escapeHtml(c)}" style="cursor: pointer; transform: scale(1.2); flex-shrink: 0;">
                <span title="${escapeHtml(displayLabel)}" style="display: inline-block;">${escapeHtml(displayLabel)}</span>
            </div>
            <div style="display: flex; gap: 4px;">
                <button type="button" class="remove-row-btn" data-col="${escapeHtml(c)}" style="background: none; border: none; color: #ef4444; font-size: 16px; cursor: pointer; padding: 0 4px;" title="Remove this item">🗑️</button>
            </div>
        </div>
        <div class="pos-controls">
            <label class="pos-coord">X <input class="pos-x clean-input" data-col="${escapeHtml(c)}" type="number" value="${x}" style="width: 70px;"></label>
            <label class="pos-coord">Y <input class="pos-y clean-input" data-col="${escapeHtml(c)}" type="number" value="${y}" style="width: 70px;"></label>
            
            <label class="pos-coord" style="margin-left: 8px;">Size
                <div style="display: inline-flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: white; margin-left: 4px;">
                    <input class="pos-fs" data-col="${escapeHtml(c)}" type="number" value="40" min="8" max="300" style="width: 45px; border: none; padding: 4px; outline: none; text-align: center;" title="Font Size">
                    <span style="padding: 4px 6px 4px 0; font-size: 12px; color: #64748b; background: white; pointer-events: none;">px</span>
                </div>
            </label>
            
            <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer;">
                <input type="checkbox" class="pos-bold" data-col="${escapeHtml(c)}"> Bold
            </label>
            
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                <input class="pos-color" data-col="${escapeHtml(c)}" type="color" value="#111111" title="Text Color">
            </div>
            
            <select class="pos-align" data-col="${escapeHtml(c)}" style="padding: 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 13px; outline: none; background: white; cursor: pointer;" title="Text Alignment">
                <option value="left">Left</option>
                <option value="center" selected>Center</option>
                <option value="right">Right</option>
            </select>
            
            <label class="pos-coord" style="margin-left: 8px;">Border 
                <div style="display: inline-flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: white;">
                    <input class="pos-border-width" data-col="${escapeHtml(c)}" type="number" step="0.1" value="0" min="0" style="width: 45px; border: none; padding: 4px; outline: none; text-align: center;" title="Border Size">
                    <span style="padding: 4px 6px 4px 0; font-size: 12px; color: #64748b; background: white; pointer-events: none;">px</span>
                </div>
            </label>
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                <input class="pos-border-color" data-col="${escapeHtml(c)}" type="color" value="#ffffff" title="Border Color">
            </div>
            
            <button type="button" class="pick-btn" data-col="${escapeHtml(c)}" style="margin: 0; padding: 8px 16px; font-size: 13px; color: #fff;">🔲 Capture</button>
        </div>
        ${isVideo ? `
        <div class="timings-container" style="margin-top: 10px; padding-left: 28px;">
            <div class="pos-timing" style="display: flex; align-items: center; gap: 12px; font-size: 13px;">
                <label style="color: #475569; font-weight: 500;">Start: <input class="pos-start clean-input" data-col="${escapeHtml(c)}" type="text" value="00:00" style="width: 70px; margin-left: 4px;" placeholder="00:00"></label>
                <label style="color: #475569; font-weight: 500;">End: <input class="pos-end clean-input" data-col="${escapeHtml(c)}" type="text" value="" style="width: 70px; margin-left: 4px;" placeholder="End (e.g. 00:05)"></label>
                <span class="pos-duration" data-col="${escapeHtml(c)}" style="color: #64748b; font-weight: 500;">Duration: Full Video</span>
                <button type="button" class="add-timing-btn" data-col="${escapeHtml(c)}" style="background: none; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer;" title="Add another time segment">➕</button>
            </div>
        </div>` : ''}
      </div>`;
};

if ($("openMergePanelBtn")) {
    $("openMergePanelBtn").onclick = () => {
        if ($("mergeModal")) $("mergeModal").style.display = "flex";
    };
}

if ($("cancelMergeBtn")) {
    $("cancelMergeBtn").onclick = () => {
        if ($("mergeModal")) $("mergeModal").style.display = "none";
    };
}

if ($("openAddColumnModalBtn")) {
    $("openAddColumnModalBtn").onclick = () => {
        if ($("addColumnModal")) $("addColumnModal").style.display = "flex";
    };
}

if ($("cancelAddColumnBtn")) {
    $("cancelAddColumnBtn").onclick = () => {
        if ($("addColumnModal")) $("addColumnModal").style.display = "none";
    };
}

if ($("createSingleColumnBtn")) {
    $("createSingleColumnBtn").onclick = () => {
        const checkedBoxes = document.querySelectorAll('.add-col-checkbox:checked');
        if (checkedBoxes.length === 0) {
            alert("Please select at least one column to add.");
            return;
        }
        
        const isVideo = $("templateVideoPreview") && $("templateVideoPreview").style.display !== "none";
        
        checkedBoxes.forEach(checked => {
            const colName = checked.value;
            const yPos = 200 + ($("positions").children.length * 80);
            const html = getPositionRowHTML(colName, 500, yPos, isVideo, colName);
            
            $("positions").insertAdjacentHTML("beforeend", html);
            
            const newRow = $("positions").lastElementChild;
            // Check the box by default
            const chk = newRow.querySelector(".col-checkbox");
            if (chk) chk.checked = true;
            
            
            // The pick-btn click is now handled by the delegated listener in setupPositionListeners
            
            checked.checked = false;
        });
        
        if ($("addColumnModal")) $("addColumnModal").style.display = "none";
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
        const separatorInp = document.getElementById("mergeSeparatorInp");
        const separatorVal = separatorInp ? separatorInp.value : " | ";
        mergedSections.push({ id: newId, label: label, cols: checked, separator: separatorVal });
        
        const isVideo = $("templateVideoPreview") && $("templateVideoPreview").style.display !== "none";
        const html = getPositionRowHTML(newId, 500, 200, isVideo, label);
        
        // Append to mergedPositions
        $("mergedPositions").insertAdjacentHTML("beforeend", html);
        
        // Add event listeners to the new row
        const newRow = $("mergedPositions").lastElementChild;
        // The pick-btn click is now handled by the delegated listener in setupPositionListeners
        
        // Uncheck the checkboxes and close modal
        document.querySelectorAll(".merge-col-checkbox").forEach(cb => cb.checked = false);
        if ($("mergeModal")) $("mergeModal").style.display = "none";
    };
}
