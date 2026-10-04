# Medcom logo asset

- Asset: `public/medcom-logo.png` (transparent RGBA PNG, 2065 × 761).
- Source: owner-provided `Logo.png`, 171 × 104; original upload is preserved.
- Editing: built-in image generation/editing tool, transparent background extraction and raster restoration. This is a raster restoration, not original vector artwork.
- Website: sidebar image uses a transparent 200 × 60 frame with proportional `object-fit: cover`; this crops surplus transparent vertical margins while keeping all visible lettering, tagline and emblem. Light mode keeps the original color asset. Dark mode renders a monochrome inverse using CSS `grayscale(1) invert(1)` for contrast against the dark sidebar; the transparent PNG is unchanged. The former white plate, ERP WORKSPACE caption and redundant company-context card are removed.
- Browser icon and shortcut use the supplied brand asset rather than the starter monogram.

## Edit prompt

Use case: background-extraction. Edit target: the attached official MEDCOMTECH logo. Produce a clean, high resolution, sharply legible faithful restoration for a website header, with a REAL TRANSPARENT alpha background. Remove only the outer white background; preserve the white MED letters within the navy emblem. Keep the exact original logo geometry, layout, original navy blue and muted gray colors, all letter forms, spacing and right-hand gray overlapping semicircle shapes. Exact main text: "MEDCOMTECH" (M E D C O M T E C H), with MED in white on the navy left emblem and COMTECH in navy. Exact small italic tagline: "Moving forward together". Do not redesign, invent lettering, add new elements, recolor, add shadows or change proportions. Enlarge and sharpen clean edges and text without halos. Crop the excess surrounding white margins to a snug wide horizontal composition around the complete logo including tagline, retaining about 3% transparent safety margin on each side. Deliver a single transparent PNG asset, logo filling the canvas, suitable to display at about 200px wide. No checkerboard drawn in the pixels, no background panel or watermark.

