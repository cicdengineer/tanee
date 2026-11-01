# Tanee catalogue

A responsive saree catalogue. Customers can browse 60 designs, inspect available views, save favourites, and send a prefilled enquiry to **+91 80733 24411** on WhatsApp.

## Catalogue admin

The admin panel is at `/admin/`. It supports individual design edits, image uploads, categories, banners, prices, category-wide changes, CSV price imports, and JSON backups/imports. Prices are shown in Indian rupees and included in WhatsApp enquiries when set.

The admin API requires PHP 8.2 or later with the `fileinfo` extension. Hostinger's PHP/HTML hosting supports this setup. The admin's writable data must stay **outside `public_html`**, so Git redeployments do not erase edits or uploads. By default, the API uses a `tanee-data` directory alongside `public_html`. You can override this with the `TANEE_DATA_DIR` environment variable.

Create `tanee-data/admin-config.php` outside `public_html` before signing in. Generate it locally with:

```sh
node tools/create_admin_config.mjs .private/tanee-data/admin-config.php taneeupdate
```

The tool reads the password from standard input without echoing it. Transfer the generated `admin-config.php` into the server-side `tanee-data` directory using Hostinger File Manager or SSH. Never commit it or place it under `public_html`. The admin API creates its own `catalogue.json` and `images/` there on the first save or upload. The repository's `catalogue.json` and `content.json` provide the initial products and banners.

For a local functional preview, run PHP with `TANEE_DATA_DIR` pointing to `.private/tanee-data` and serve the repository root. A plain static HTTP server can preview the storefront but cannot execute the admin API.

The homepage rotates through five banners supplied in `wallpapers/`. Smaller WebP copies in `assets/banners/` are served to visitors. The text and colour treatment change with each banner; the catalogue and WhatsApp selection work as before.

## Preview

Run a local HTTP server in this directory, then open its local URL:

```sh
python -m http.server 8000
```

## Hosting

Deploy this repository to `public_html` for `gallery.tanee.in` using Hostinger's PHP/HTML Git integration. PHP is needed for admin saves and image uploads. Keep `tanee-data` outside the Git deployment directory.

The WhatsApp message lists the selected design names and codes. WhatsApp requires the customer to press **Send** in the app; a website cannot send the message on their behalf.

## Refreshing images

Run `python tools/prepare_catalogue.py "<path to Tanee folder>"` after installing Pillow (`pip install Pillow`). This regenerates the web-sized WebP images and `catalogue.json` from each product folder's `Website` images.
