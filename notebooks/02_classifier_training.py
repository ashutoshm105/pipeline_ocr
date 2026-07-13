"""
02 - Classifier Training
========================
Train and evaluate the document-type classifier that routes images to the
correct OCR engine. Categories: printed_report, handwritten_prescription,
table_lab_result, mixed. Uses a lightweight CNN or fine-tuned ResNet on
labelled sample images.

Run cells interactively with a Jupyter kernel or VS Code interactive window.
"""

# %% Imports
# import torch
# from torch import nn
# from torch.utils.data import DataLoader
# from torchvision import transforms, datasets
# from pathlib import Path

# %% Dataset setup
# data_dir = Path("../tests/sample_images/classified")
# transform = transforms.Compose([
#     transforms.Resize((224, 224)),
#     transforms.ToTensor(),
#     transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
# ])
# dataset = datasets.ImageFolder(data_dir, transform=transform)
# loader = DataLoader(dataset, batch_size=16, shuffle=True)

# %% Model definition
# model = torch.hub.load("pytorch/vision", "resnet18", pretrained=True)
# model.fc = nn.Linear(model.fc.in_features, len(dataset.classes))

# %% Training loop
# optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
# criterion = nn.CrossEntropyLoss()
# for epoch in range(10):
#     for images, labels in loader:
#         loss = criterion(model(images), labels)
#         optimizer.zero_grad()
#         loss.backward()
#         optimizer.step()
#     print(f"Epoch {epoch+1} loss: {loss.item():.4f}")

# %% Save model
# torch.save(model.state_dict(), "../classifier/model.pt")
