"""d38999conv - prototype source-image -> arrangement JSON converter (M4 prep).

Modules are independently replaceable:
  adapter   - load raster from PNG/JPG/PDF
  geometry  - detect insert + contact circles
  text      - detect label boxes + pluggable LabelReader
  assign    - assign labels to contacts
  checks    - QA warnings + confidence
  cli       - batch driver
"""
