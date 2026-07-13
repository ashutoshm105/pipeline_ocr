"""Optional CNN-based document classifier using MobileNetV3-Small.

Falls back gracefully when PyTorch or torchvision are not installed.
"""

from typing import Dict, List, Optional

import numpy as np

try:
    import torch
    import torch.nn as nn
    from torchvision import transforms
    from torchvision.models import mobilenet_v3_small

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False


# Default class labels matching the heuristic classifier
_DEFAULT_CLASSES: List[str] = ["TABLE", "HANDWRITTEN", "PRINTED_TEXT"]


class ClassifierCNN:
    """MobileNetV3-Small classifier for document images.

    Loads a pretrained MobileNetV3-Small backbone and replaces the final
    classifier head to predict document classes.  If no weights path is
    provided the model uses random (untrained) weights for the head.

    Attributes:
        classes: Ordered list of class labels.
        device: Torch device the model runs on.
    """

    def __init__(
        self,
        weights_path: Optional[str] = None,
        classes: Optional[List[str]] = None,
        device: Optional[str] = None,
    ) -> None:
        """Initialise the CNN classifier.

        Args:
            weights_path: Optional path to a saved state dict for the full
                model (backbone + head).  When ``None`` the backbone uses
                ImageNet weights and the head is randomly initialised.
            classes: Ordered class labels.  Defaults to
                ``["TABLE", "HANDWRITTEN", "PRINTED_TEXT"]``.
            device: ``"cpu"`` or ``"cuda"``.  Auto-detected when ``None``.

        Raises:
            RuntimeError: If PyTorch is not installed.
        """
        if not _TORCH_AVAILABLE:
            raise RuntimeError(
                "PyTorch and torchvision are required for ClassifierCNN. "
                "Install with: pip install torch torchvision"
            )

        self.classes: List[str] = classes if classes is not None else list(_DEFAULT_CLASSES)

        if device is not None:
            self.device = torch.device(device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        num_classes = len(self.classes)

        model = mobilenet_v3_small(weights="IMAGENET1K_V1")
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)

        if weights_path is not None:
            state_dict = torch.load(weights_path, map_location=self.device)
            model.load_state_dict(state_dict)

        self._model = model.to(self.device)
        self._model.eval()

        self._transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

    def predict(self, image: np.ndarray) -> Dict[str, object]:
        """Classify a document image.

        Args:
            image: Input image as a numpy ndarray, either grayscale
                (H x W) or BGR (H x W x 3).  Values should be uint8.

        Returns:
            Dict with keys:
                predicted_class: The predicted class label.
                confidence: Softmax probability of the predicted class.
                fallback_class: Always ``"PRINTED_TEXT"``.
                fallback_triggered: Always ``False`` for CNN predictions.
        """
        if len(image.shape) == 2:
            image = np.stack([image, image, image], axis=-1)
        elif image.shape[2] == 4:
            image = image[:, :, :3]

        # torchvision ToPILImage expects RGB; OpenCV loads as BGR
        rgb = image[:, :, ::-1].copy()

        tensor = self._transform(rgb).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self._model(tensor)
            probs = torch.softmax(logits, dim=1)
            confidence, idx = torch.max(probs, dim=1)

        predicted_class = self.classes[idx.item()]

        return {
            "predicted_class": predicted_class,
            "confidence": float(confidence.item()),
            "fallback_class": "PRINTED_TEXT",
            "fallback_triggered": False,
        }


def create_classifier(
    weights_path: Optional[str] = None,
    classes: Optional[List[str]] = None,
    device: Optional[str] = None,
) -> Optional["ClassifierCNN"]:
    """Factory that returns a ClassifierCNN or None if torch is missing.

    This is the recommended entry point -- callers can check for ``None``
    instead of catching ``RuntimeError``.

    Args:
        weights_path: Optional path to saved model weights.
        classes: Ordered class labels.
        device: Torch device string.

    Returns:
        A ``ClassifierCNN`` instance, or ``None`` if PyTorch is unavailable.
    """
    if not _TORCH_AVAILABLE:
        return None
    return ClassifierCNN(
        weights_path=weights_path,
        classes=classes,
        device=device,
    )
