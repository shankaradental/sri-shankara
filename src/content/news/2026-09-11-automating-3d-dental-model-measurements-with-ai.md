---
title: "Automating 3D Dental Model Measurements with Artificial Intelligence"
description: "Researchers tested an AI system that detects dental landmarks and calculates arch length discrepancy on 3D dental models in under four seconds."
pubDate: 2026-09-11
category: "Technology"
reviewedBy: "Dr. Advaitha Anand, BDS MDS (Conservative Dentistry & Endodontics)"
sources:
  - title: "Bae M, Park JW, Kim M, Baek SH, Kim N. Automated dental landmark detection and model-analysis measurements on 3D digital dental models using a projection-based two-stage cascade convolutional neural network. 2026. DOI 10.1016/j.cmpb.2026.109615"
    url: "https://doi.org/10.1016/j.cmpb.2026.109615"
draft: false
---

When planning orthodontic treatment such as braces or aligners, dentists and orthodontists rely heavily on detailed digital models of a patient's teeth. These three-dimensional (3D) dental scans allow clinicians to assess how teeth fit together, check spacing, and take precise measurements. One essential measurement is arch length discrepancy, which evaluates whether there is sufficient room in the dental arch for all teeth to align properly or if crowding or spacing exists.

Traditionally, identifying reference points—known as dental landmarks—and calculating these measurements on 3D models is done manually. This process is time-consuming and often shows substantial variability between different examiners. To address these challenges, researchers developed and evaluated an automated artificial intelligence system designed to detect landmarks and calculate measurements on digital dental models.

## How the Artificial Intelligence System Works

The experimental approach uses a two-stage cascade convolutional neural network, a type of artificial intelligence designed for analyzing visual information.

Rather than processing complex 3D files directly, the system first converts each 3D dental model into five distinct two-dimensional (2D) feature maps. These maps capture depth, surface curvature, and three spatial orientations (the x-, y-, and z-components of the surface normal).

Once these 2D representations are created, the software runs through two distinct stages:

1. **Tooth Region Detection:** The first stage uses a neural network called RetinaNet to detect and outline individual tooth regions across the model.
2. **Landmark Localization:** The second stage employs another neural network, U-Net, to pinpoint 34 specific dental landmarks across each dental model.

After the AI identifies these landmarks in the 2D maps, the system maps the coordinates back onto the original 3D surface. It then uses these coordinates to automatically compute orthodontic measurements, including arch length discrepancy.

## What the Study Found

The researchers trained and tested the system using 1,427 digital dental models collected from 714 patients.

In the primary internal test set of 111 complete-dentition models (scans with a full set of teeth), the artificial intelligence demonstrated the following performance metrics:

- **Tooth-region detection:** The system achieved a 99.44% success rate and a mean Intersection over Union (IoU, a measure of overlap accuracy) of 0.91 ± 0.06.
- **Landmark accuracy:** The average localization error across all predicted landmarks was 0.66 ± 0.49 millimetres.
- **Measurement consistency:** The mean error in arch length discrepancy calculated by the AI was 0.90 ± 0.72 millimetres. This was comparable to the variation seen when the same human observer re-measured the models (intra-observer error of 0.95 ± 0.78 millimetres).
- **Processing speed:** The automated analysis required less than 4 seconds per model on average.

## Study Limitations

While the internal results were consistent, the researchers also conducted a preliminary external evaluation using 22 models from 11 patients at an independent institution. In this external group, the mean arch length discrepancy error rose to 1.70 ± 0.86 millimetres, indicating higher error when applied to data from an outside clinical setting.

Additionally, the external evaluation was limited by a very small sample size of only 22 models from 11 patients, and the primary testing focused exclusively on complete-dentition models rather than models with missing teeth.

## What This Means for Patients

Orthodontic treatment planning requires precise measurements to determine how teeth should move. Currently, dental professionals spend significant time manually calculating dimensions like arch length discrepancy from dental scans.

This research shows that automated tools can analyze digital dental scans in under 4 seconds with landmark accuracy close to human measurements on internal test data. However, because errors increased when tested on scans from an independent institution, further evaluation on diverse patient scans is necessary. For patients, these emerging software tools represent potential future aids to support clinicians in analyzing orthodontic records efficiently.
