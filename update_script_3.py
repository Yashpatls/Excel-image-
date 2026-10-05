import re

with open('static/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add is_merged logic to previewBtn
content = content.replace('''        if (colorEl) positions[c].color = colorEl.value || "#111111";
        if (boldEl) positions[c].bold = boldEl.checked;''', '''        if (colorEl) positions[c].color = colorEl.value || "#111111";
        if (boldEl) positions[c].bold = boldEl.checked;
        const mergedEl = document.querySelector(.merged-indicator[data-col="\"]);
        if (mergedEl) {
            positions[c].is_merged = true;
            positions[c].merged_columns = c.replace('_merged_', '').split('_');
        }''')

with open('static/script.js', 'w', encoding='utf-8') as f:
    f.write(content)
