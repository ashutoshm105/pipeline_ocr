"""
01 - Preprocessing Exploration
==============================
Explore and visualize the image preprocessing pipeline stages:
grayscale conversion, binarization, deskew, noise removal, and contrast
enhancement. Use this notebook to tune preprocessing parameters for
different document types (printed reports, handwritten prescriptions,
tabular lab results).

Run cells interactively with a Jupyter kernel or VS Code interactive window.
"""

# %% Imports
# import cv2
# import numpy as np
# from PIL import Image
# from deskew import determine_skew
# from pathlib import Path

# %% Load a sample image
# img_path = Path("../tests/sample_images/sample_report.jpg")
# img = cv2.imread(str(img_path))
# gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# %% Deskew
# angle = determine_skew(gray)
# print(f"Detected skew angle: {angle:.2f} degrees")

# %% Binarization comparison
# _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
# adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
#                                   cv2.THRESH_BINARY, 11, 2)

# %% Visual comparison (matplotlib or cv2.imshow)
# # Display original, grayscale, otsu, adaptive side by side
