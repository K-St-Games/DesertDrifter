import os
from rembg import remove

# Explicitly check these
files = [
    "art/source/car.png",
    "art/source/trailer.png",
    "art/source/tumbleweed.png",
    "art/source/rock.png",
    "art/source/turtle.png",
    "art/source/tree.png",
    "art/source/ufo.png"
]

print("Starting cleanup...")

for path in files:
    if os.path.exists(path):
        print(f"Processing {path}...")
        try:
            with open(path, "rb") as f:
                input_data = f.read()
            
            output_data = remove(input_data)
            
            with open(path, "wb") as f:
                f.write(output_data)
            print(f"Fixed {path}")
        except Exception as e:
            print(f"Error on {path}: {e}")
    else:
        print(f"File not found: {path}")

print("Cleanup finished.")
