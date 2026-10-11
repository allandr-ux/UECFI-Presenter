<?php
/**
 * Public read-only REST API (namespace uecfi/v1):
 *
 *   GET /app                      app-update manifest
 *   GET /bibles                   Bible catalog
 *   GET /bibles/<slug>            single Bible entry (same shape as catalog rows)
 *   GET /songs                    song-pack catalog
 *   GET /songs/<slug>             single song-pack entry
 *   GET /download/bible/<slug>    Bible file download (attachment stream)
 *   GET /download/song/<slug>     song-pack file download
 */

if (!defined('ABSPATH')) {
    exit;
}

class UECFI_API {

    public static function register_routes() {
        register_rest_route(UECFI_API_NS, '/app', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'get_manifest'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route(UECFI_API_NS, '/bibles', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'list_bibles'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route(UECFI_API_NS, '/bibles/(?P<slug>[a-z0-9-]+)', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'get_bible'),
            'permission_callback' => '__return_true',
            'args'                => array(
                'slug' => array(
                    'validate_callback' => array(__CLASS__, 'valid_slug'),
                ),
            ),
        ));

        register_rest_route(UECFI_API_NS, '/songs', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'list_songs'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route(UECFI_API_NS, '/songs/(?P<slug>[a-z0-9-]+)', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'get_song'),
            'permission_callback' => '__return_true',
            'args'                => array(
                'slug' => array(
                    'validate_callback' => array(__CLASS__, 'valid_slug'),
                ),
            ),
        ));

        register_rest_route(UECFI_API_NS, '/download/(?P<kind>bible|song)/(?P<slug>[a-z0-9-]+)', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array(__CLASS__, 'download'),
            'permission_callback' => '__return_true',
            'args'                => array(
                'slug' => array(
                    'validate_callback' => array(__CLASS__, 'valid_slug'),
                ),
            ),
        ));
    }

    public static function valid_slug($value) {
        return is_string($value) && preg_match('/^[a-z0-9-]+$/', $value);
    }

    private static function cached($data) {
        $res = new WP_REST_Response($data, 200);
        // Catalogs change only when an admin publishes; safe to cache briefly.
        $res->header('Cache-Control', 'public, max-age=3600');
        return $res;
    }

    public static function get_manifest() {
        return self::cached(UECFI_API_Catalog::get_manifest());
    }

    public static function list_bibles() {
        $items = array_map(
            array('UECFI_API_Catalog', 'describe'),
            UECFI_API_Catalog::list_items(UECFI_API_CPT_BIBLE)
        );
        return self::cached(array_values($items));
    }

    public static function get_bible(WP_REST_Request $req) {
        return self::single(UECFI_API_CPT_BIBLE, $req['slug'], __('Bible not found.', 'uecfi-presenter-api'));
    }

    public static function list_songs() {
        $items = array_map(
            array('UECFI_API_Catalog', 'describe'),
            UECFI_API_Catalog::list_items(UECFI_API_CPT_SONG)
        );
        return self::cached(array_values($items));
    }

    public static function get_song(WP_REST_Request $req) {
        return self::single(UECFI_API_CPT_SONG, $req['slug'], __('Song pack not found.', 'uecfi-presenter-api'));
    }

    private static function single($cpt, $slug, $not_found_message) {
        $post = UECFI_API_Catalog::find_by_slug($cpt, $slug);
        if (!$post) {
            return new WP_Error('uecfi_not_found', $not_found_message, array('status' => 404));
        }
        return self::cached(UECFI_API_Catalog::describe($post));
    }

    public static function download(WP_REST_Request $req) {
        $cpt = ($req['kind'] === 'song') ? UECFI_API_CPT_SONG : UECFI_API_CPT_BIBLE;
        $post = UECFI_API_Catalog::find_by_slug($cpt, $req['slug']);
        if (!$post) {
            return new WP_Error('uecfi_not_found', __('File not found.', 'uecfi-presenter-api'), array('status' => 404));
        }
        // Externally hosted file (e.g. Cloudflare R2): redirect so the bytes
        // are served by object storage, not PHP. API URLs stay stable.
        $external = UECFI_API_Catalog::sanitize_external_url(
            get_post_meta($post->ID, UECFI_API_Catalog::META_URL, true)
        );
        if ($external !== '') {
            $res = new WP_REST_Response(null, 302);
            $res->header('Location', $external);
            $res->header('Cache-Control', 'public, max-age=3600');
            return $res;
        }
        $path = UECFI_API_Catalog::attachment_path($post->ID);
        if (!$path) {
            return new WP_Error('uecfi_no_file', __('No file attached to this entry.', 'uecfi-presenter-api'), array('status' => 404));
        }

        nocache_headers();
        $filename = sanitize_file_name(basename($path));
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($path));

        // Chunked stream: multi-MB Bibles never sit fully in PHP memory.
        $fh = fopen($path, 'rb');
        if (!$fh) {
            return new WP_Error('uecfi_unreadable', __('File is not readable.', 'uecfi-presenter-api'), array('status' => 500));
        }
        while (!feof($fh)) {
            $chunk = fread($fh, 8192);
            if ($chunk === false) {
                break;
            }
            echo $chunk; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        }
        fclose($fh);
        exit;
    }
}
