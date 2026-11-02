# Tanee catalogue

A responsive saree catalogue. Customers can browse 60 designs, inspect available views, save favourites, and send a prefilled enquiry to **+91 80733 24411** on WhatsApp.

## Catalogue admin

The admin panel is at `/admin/`. It supports individual design edits, image uploads, categories, banners, prices, category-wide changes, CSV price imports, category-specific design code renumbering, and JSON backups/imports. Each design has a customer-facing design code in `SDM01-01` format, stored as `sku` in catalogue data. The initial 60 designs use `SDM01-01` through `SDM01-60`; new designs receive the next available code. Older saved catalogues receive these codes automatically when loaded by the updated API. Prices are shown in Indian rupees and included in WhatsApp enquiries when set.

Available Qty can be set per design or across a category in **Bulk update**. Leave it blank when stock is not tracked. Designs with Qty 0 appear under **Out of stock** in admin. Use **Remove from website** there to take down a design, or **Show on website** to restore it; changing Qty alone does not change website visibility. Visibility can also be changed in the design editor. Quantities and visibility flags are omitted from the public API and customer screens. The site does not place orders or decrement stock automatically, so update Qty after orders and deliveries.

The admin API requires PHP 8.2 or later with the `fileinfo` extension. Hostinger's PHP/HTML hosting supports this setup. The admin's writable data must stay **outside `public_html`**, so Git redeployments do not erase edits or uploads. By default, the API uses a `tanee-data` directory alongside `public_html`. You can override this with the `TANEE_DATA_DIR` environment variable.

Create `tanee-data/admin-config.php` outside `public_html` before signing in. Generate it locally with:

```sh
node tools/create_admin_config.mjs .private/tanee-data/admin-config.php taneeupdate
```

The tool reads the password from standard input without echoing it. Transfer the generated `admin-config.php` into the server-side `tanee-data` directory using Hostinger File Manager or SSH. Never commit it or place it under `public_html`. The admin API creates its own `catalogue.json` and `images/` there on the first save or upload. The repository's `catalogue.json` and `content.json` provide the initial products and banners.

For a local functional preview, run PHP with `TANEE_DATA_DIR` pointing to `.private/tanee-data` and serve the repository root. A plain static HTTP server can preview the storefront but cannot execute the admin API.

The homepage rotates through five banners supplied in `wallpapers/`. Smaller WebP copies in `assets/banners/` are served to visitors. The collection supports category, search, and ordering controls. The popup and WhatsApp selection show the design code for each product.

The initial designs are grouped by visible border width: **Mudra - Slim Border**, **Tarang - Medium Border**, and **Virasat - Broad Border**. The API updates the older pattern-based categories in saved catalogues while preserving prices, design codes, and custom categories. New designs generated from image folders are marked `Border Review` until their border width is assessed in admin.

Selected designs are grouped into the traditional collections **Vaibhava** (₹1,840), **Aabharana** (₹1,500), and **Saumya** (₹1,390). The API applies these assignments once to existing server-side catalogues, then preserves later admin edits. The image preparation tool keeps established categories, prices, and design codes when refreshing product images.

Three further border motifs are grouped as **Pallava** (single zari band), **Shikha** (paired pointed motifs), and **Alankara** (ornate woven motif). Their 30 colourways are priced at ₹1,450 each and assigned `SDM02-01` through `SDM02-30` design codes. The API applies these changes once to saved server-side catalogues, then preserves later admin edits.

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
