=== UECFI Presenter API ===
Contributors: uecfi
Tags: rest-api, church, presenter, downloads
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Versioned REST API for the UECFI Presenter desktop app: app-update manifest, Bible catalog, and song-pack catalog with file downloads.

== Description ==

This plugin gives the UECFI Presenter desktop app a server to talk to. It exposes
public, read-only JSON endpoints (namespace `uecfi/v1`) and an admin UI to manage
everything without touching code:

* **App-update manifest** — latest version, minimum supported version, release
  notes, and Windows/Mac installer URLs at `GET /wp-json/uecfi/v1/app`.
* **Bible catalog** — `GET /wp-json/uecfi/v1/bibles` and `/bibles/<slug>`.
* **Song-pack catalog** — `GET /wp-json/uecfi/v1/songs` and `/songs/<slug>`.
* **Downloads** — `GET /wp-json/uecfi/v1/download/bible/<slug>` and
  `/download/song/<slug>` stream the attached file with correct headers.

Each catalog row carries `slug`, `name`, `description`, `version`, `size`,
`sha256`, `updated`, and `url`. File size and SHA-256 are computed once on save,
so catalog responses stay fast even for multi-MB Bibles.

Manage content under the “Presenter API → Bibles / Song Packs” admin menus
(title + optional excerpt as description + Release Details box for version, slug,
and file). Only **Published** entries appear in the catalog.

= Storing files on Cloudflare R2 =
Upload the file to your R2 bucket (public via custom domain, e.g.
`downloads.uecfi.net`), then paste its full `https://…` URL into the item's
**external file URL** field instead of picking a library file. The API download
URL stays the same and redirects to R2; size is probed automatically, and you
may paste the file's SHA-256 (computed locally before upload) so apps verify
downloads. Without a hash, apps install with a “no checksum published” note. Manifest settings
live under “Presenter API”.

== Installation ==

1. Upload the `uecfi-presenter-api` folder to `/wp-content/plugins/`.
2. Activate “UECFI Presenter API” in Plugins.
3. Open “Presenter API” in the admin menu, fill in the app-update manifest.
4. Add Bibles / Song Packs: title, optional excerpt (used as description),
   version, slug, and attach the release file. Publish.
5. Point the desktop app at `https://your-site.com/wp-json/uecfi/v1`.

Pretty permalinks must be enabled for `/wp-json/` routing (Settings → Permalinks;
anything but “Plain” works). Serve the site over HTTPS. `.xml` uploads are
allowed automatically while you manage Bibles / Song Packs (scoped to those
screens, so the rest of the site's upload policy is untouched). On Multisite,
also add `xml` to the network “Upload file types” list. If uploads of large
files fail by size rather than type, raise the PHP upload limits — see FAQ.

== Frequently Asked Questions ==

= Do downloaders need a WordPress account? =
No. Catalog and download routes are public and read-only. All writes require an
admin session with `manage_options` / post-editing capabilities and nonces.

= Will big Bible files exhaust PHP memory? =
No. Hashing reads in 1 MB chunks on save, and downloads stream in 8 KB chunks.

= Can I restrict who downloads? =
Out of the box the catalog is public, which suits a church distribution model.
If you need restriction later, filter `rest_pre_dispatch` or put the site behind
basic auth — the route structure does not need to change.

== Changelog ==

= 1.0.4 =
* External file URLs per item (e.g. Cloudflare R2): paste a URL instead of
  uploading; downloads redirect to it. Optional manual SHA-256, best-effort
  size probe.

= 1.0.3 =
* Separate Windows/Mac installer SHA-256 fields (legacy single field kept).

= 1.0.2 =
* Admin menu: collision-free position plus an explicit Overview landing entry,
  so the parent item always opens the manifest page.

= 1.0.1 =
* Allow `.xml` uploads while managing catalog items (scoped, no site-wide change).

= 1.0.0 =
* Initial release: manifest, Bible and song-pack catalogs, downloads, admin UI.
