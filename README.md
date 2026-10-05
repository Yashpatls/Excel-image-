# Excel Image Automation Generator

A complete local Flask application that reads an Excel file and writes each row's data onto a template image.

## Features

- Upload PNG/JPG/JPEG/WEBP template image
- Upload XLSX/XLSM Excel file
- Automatically read Excel columns
- Choose the name column for filenames
- Set X/Y position for every Excel column
- Set font size, color, and alignment
- Generate one PNG per Excel row
- Download all generated images as a ZIP
- No API key and no internet service required

## Windows Setup

Open Command Prompt inside this folder:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open:

http://127.0.0.1:5000

## How to use

1. Upload your template image.
2. Upload your Excel file.
3. Click **Upload & Read Excel**.
4. Select the Name column.
5. Set X/Y coordinates for each Excel column.
6. Click **Generate All Images**.
7. Download the generated ZIP.

## Excel example

| Name | ID | Department | Date |
|---|---|---|---|
| Yash Varmora | 101 | IT | 14-09-2026 |
| Rahul Patel | 102 | Computer | 14-09-2026 |

Every row creates a separate image.

## Important

Coordinates are measured in pixels from the top-left of the template image.

For a 1240 x 1754 image, the center is approximately:

X = 620
Y = 877

The original template is never modified.
