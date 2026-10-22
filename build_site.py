"""Build the Netlify pack from portfolio.html.

Run:  python build_site.py
Makes site/ (index.html + icons/) and DungNT-Portfolio-netlify.zip. Drag either onto Netlify.
"""
import os
import shutil
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "portfolio.html")
SITE = os.path.join(HERE, "site")
ZIP = os.path.join(HERE, "DungNT-Portfolio-netlify.zip")

HEAD_EXTRA = (
    '<title>Dũng NT · Game Designer Portfolio</title>\n'
    '<meta name="description" content="Nguyễn Trọng Dũng, game designer specialized in mobile puzzle games. Play the portfolio as a small 3D level map.">\n'
    '<meta property="og:type" content="website">\n'
    '<meta property="og:title" content="Dũng NT · Game Designer Portfolio">\n'
    '<meta property="og:description" content="Game designer specialized in mobile puzzle games. Play the portfolio as a small 3D level map.">\n'
    '<meta name="theme-color" content="#0c1115">\n'
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E'
    '%3Crect x=%2711%27 y=%274%27 width=%2710%27 height=%2712%27 rx=%273%27 fill=%27%23ff5d3a%27/%3E'
    '%3Crect x=%2711%27 y=%2716%27 width=%2710%27 height=%2712%27 rx=%274%27 fill=%27%232c9a6a%27/%3E%3C/svg%3E">'
)


def build():
    page = open(SRC, encoding="utf-8").read()
    page = page.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    page = page.replace("<title>Level Map Portfolio</title>", HEAD_EXTRA, 1)
    cut = page.index("</style>") + len("</style>")
    html = ("<!doctype html>\n<html lang=\"en\">\n<head>\n" + page[:cut].strip() +
            "\n</head>\n<body>\n" + page[cut:].strip() + "\n</body>\n</html>\n")

    shutil.rmtree(SITE, ignore_errors=True)
    os.makedirs(os.path.join(SITE, "icons"))
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    icons = os.path.join(HERE, "icons")
    names = sorted(os.listdir(icons))
    for name in names:
        stem, ext = os.path.splitext(name)
        if ext.lower() == ".png" and stem + ".webp" in names:
            continue  # the page uses the lighter WebP copy; the PNG stays as the source
        if ext.lower() in (".png", ".webp", ".jpg"):
            shutil.copy2(os.path.join(icons, name), os.path.join(SITE, "icons", name))

    photos = os.path.join(HERE, "photos")  # About portraits
    if os.path.isdir(photos):
        os.makedirs(os.path.join(SITE, "photos"))
        for name in sorted(os.listdir(photos)):
            if name.lower().endswith((".webp", ".jpg", ".jpeg", ".png")):
                shutil.copy2(os.path.join(photos, name), os.path.join(SITE, "photos", name))

    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(SITE):
            for name in files:
                full = os.path.join(root, name)
                z.write(full, os.path.relpath(full, SITE))
    print("site/ and", os.path.basename(ZIP), "are ready")


if __name__ == "__main__":
    build()
