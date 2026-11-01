# Tanee catalogue

A static, responsive saree catalogue. Customers can browse 60 designs, inspect available views, save favourites, and send a prefilled enquiry to **+91 80733 24411** on WhatsApp.

The homepage rotates through five banners supplied in `wallpapers/`. Smaller WebP copies in `assets/banners/` are served to visitors. The text and colour treatment change with each banner; the catalogue and WhatsApp selection work as before.

## Preview

Run a local HTTP server in this directory, then open its local URL:

```sh
python -m http.server 8000
```

## Hosting

Upload `index.html`, `styles.css`, `app.js`, `catalogue.json`, and `assets/` to the `public_html` directory for `gallery.tanee.in` in Hostinger, or connect this repository to your preferred static host. No server or build step is needed.

The WhatsApp message lists the selected design names and codes. WhatsApp requires the customer to press **Send** in the app; a website cannot send the message on their behalf.

## Refreshing images

Run `python tools/prepare_catalogue.py "<path to Tanee folder>"` after installing Pillow (`pip install Pillow`). This regenerates the web-sized WebP images and `catalogue.json` from each product folder's `Website` images.
