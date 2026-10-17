# Guided Parcel Photography

Registration and resident collection use the same in-app camera dialog. The guide encourages the entire parcel and shipping label to be visible. It is a framing aid, not object detection, and never claims that a parcel has been detected.

The guide adapts to the actual camera aspect ratio. Capture saves the full frame at the video source dimensions as JPEG; overlays are not drawn into the saved image. The existing 5 MB upload limit is enforced. Staff/residents can review, retake or choose an existing photo. Original evidence is not cropped or masked.

Registration sends an accepted photo to the existing registration photo endpoint. Collection first places it in the existing pending preview and still requires Use & Upload Photo. Barcode checks, pending-photo restrictions, confirmation, room assignments and authorization are unchanged.

Camera access begins only on request. Streams stop on capture, close, hidden tabs, expired/disabled collection state, navigation and unmount; late permission responses are also stopped. The native modal supports Escape, focus containment and focus restoration. Camera errors retain upload and retry alternatives.

## Detection Follow-up

No YOLO model or new inference dependency is installed: the user confirmed guides first and has no trained model or labelled dataset yet. Future detection should independently locate each parcel on a temporary analysis copy, preserve originals, support uncertain/multiple detections and validate performance on boxes, envelopes and courier bags. Existing photo comparison still includes background pixels; the guide only improves framing consistency.

## Verification

The guided-camera browser suite uses synthetic media streams and intercepted APIs to verify both workflows at desktop, tablet and mobile sizes, full-frame dimensions and edge pixels, retakes, review-before-upload, denied permissions, hidden-tab recovery and delayed camera cleanup. Existing parcel-room/registration and multi-parcel collection suites provide regressions. Physical mobile camera hardware is not covered by these automated tests.
