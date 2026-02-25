import os
import subprocess

def generate_favicons(source_path, target_dir):
    if not os.path.exists(source_path):
        print(f"Error: Source file {source_path} not found.")
        return

    # Ensure target directory exists
    os.makedirs(target_dir, exist_ok=True)

    # List of target files and their sizes inferred from filenames
    targets = [
        ("android-chrome-144x144.png", 144, 144),
        ("android-chrome-192x192.png", 192, 192),
        ("android-chrome-256x256.png", 256, 256),
        ("android-chrome-36x36.png", 36, 36),
        ("android-chrome-384x384.png", 384, 384),
        ("android-chrome-48x48.png", 48, 48),
        ("android-chrome-512x512.png", 512, 512),
        ("android-chrome-72x72.png", 72, 72),
        ("android-chrome-96x96.png", 96, 96),
        ("apple-touch-icon-1024x1024.png", 1024, 1024),
        ("apple-touch-icon-114x114.png", 114, 114),
        ("apple-touch-icon-120x120.png", 120, 120),
        ("apple-touch-icon-144x144.png", 144, 144),
        ("apple-touch-icon-152x152.png", 152, 152),
        ("apple-touch-icon-167x167.png", 167, 167),
        ("apple-touch-icon-180x180.png", 180, 180),
        ("apple-touch-icon-57x57.png", 57, 57),
        ("apple-touch-icon-60x60.png", 60, 60),
        ("apple-touch-icon-72x72.png", 72, 72),
        ("apple-touch-icon-76x76.png", 76, 76),
        ("apple-touch-icon-precomposed.png", 180, 180),
        ("apple-touch-icon.png", 180, 180),
        ("favicon-16x16.png", 16, 16),
        ("favicon-32x32.png", 32, 32),
        ("favicon-48x48.png", 48, 48),
        ("mstile-144x144.png", 144, 144),
        ("mstile-150x150.png", 150, 150),
        ("mstile-310x310.png", 310, 310), # For square tiles
        ("mstile-70x70.png", 70, 70),
        ("yandex-browser-50x50.png", 50, 50),
    ]

    for filename, width, height in targets:
        print(f"Generating {filename} ({width}x{height})...")
        target_path = os.path.join(target_dir, filename)
        # Use sips to resize
        subprocess.run([
            "sips", "-z", str(height), str(width), source_path, "--out", target_path
        ], check=True, capture_output=True)

    # Special case for non-square mstile-310x150
    print("Generating mstile-310x150.png...")
    # Since the logo is square, we'll just resize to 150x150 and ignore the aspect ratio for now
    # or better, just resize it to 150x150 and it'll look okay in the tile.
    subprocess.run([
        "sips", "-z", "150", "310", source_path, "--out", os.path.join(target_dir, "mstile-310x150.png")
    ], check=True, capture_output=True)

    # Generate favicon.ico using sips (converting 32x32 PNG to ICO if supported, else just PNG as fallback for most browsers)
    print("Generating favicon.ico...")
    temp_ico_png = os.path.join(target_dir, "favicon_temp.png")
    subprocess.run([
        "sips", "-z", "32", "32", source_path, "--out", temp_ico_png
    ], check=True, capture_output=True)
    
    # Apple's sips doesn't natively support .ico output in all versions, 
    # but most modern browsers will accept a PNG renamed to .ico as a fallback.
    # However, we can try to use 'sips -s format ico' and see if it works.
    try:
        subprocess.run([
            "sips", "-s", "format", "ico", temp_ico_png, "--out", os.path.join(target_dir, "favicon.ico")
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("sips ico export failed, falling back to PNG-as-ICO...")
        subprocess.run(["cp", temp_ico_png, os.path.join(target_dir, "favicon.ico")], check=True)
    
    os.remove(temp_ico_png)

if __name__ == "__main__":
    SOURCE = "/Users/hmenon/Documents/Projects/Alethia/public/ARGUS_Logo.png"
    # Generate into a temp directory first
    TARGET = "/Users/hmenon/Documents/Projects/Alethia/.tmp/new_favicons"
    generate_favicons(SOURCE, TARGET)
    print(f"Done! Favicons generated in {TARGET}")
