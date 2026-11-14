<?php
/**
 * Catalog storage: two private custom post types (Bibles, song packs) plus
 * the app-update manifest option. All reads used by the REST layer live here.
 */

if (!defined('ABSPATH')) {
    exit;
}

class UECFI_API_Catalog {

    const META_VERSION = '_uecfi_version';
    const META_SLUG    = '_uecfi_slug';
    const META_FILE_ID = '_uecfi_file_id';
    const META_URL     = '_uecfi_file_url';
    const META_SIZE    = '_uecfi_file_size';
    const META_SHA256  = '_uecfi_file_sha256';
    const META_TITLES  = '_uecfi_song_titles';

    public static function post_types() {
        return array(
            UECFI_API_CPT_BIBLE => array(
                'singular' => __('Bible', 'uecfi-presenter-api'),
                'plural'   => __('Bibles', 'uecfi-presenter-api'),
                'menu_icon'=> 'dashicons-book-alt',
            ),
            UECFI_API_CPT_SONG => array(
                'singular' => __('Song Pack', 'uecfi-presenter-api'),
                'plural'   => __('Song Packs', 'uecfi-presenter-api'),
                'menu_icon'=> 'dashicons-format-audio',
            ),
        );
    }

    public static function register_post_types() {
        foreach (self::post_types() as $cpt => $labels) {
            register_post_type($cpt, array(
                'labels' => array(
                    'name'          => $labels['plural'],
                    'singular_name' => $labels['singular'],
                    'add_new_item'  => sprintf(__('Add New %s', 'uecfi-presenter-api'), $labels['singular']),
                    'edit_item'     => sprintf(__('Edit %s', 'uecfi-presenter-api'), $labels['singular']),
                    'all_items'     => sprintf(__('All %s', 'uecfi-presenter-api'), $labels['plural']),
                ),
                'public'             => false,
                'show_ui'            => true,
                'show_in_menu'       => 'uecfi-presenter-api',
                'show_in_rest'       => false,
                'supports'           => array('title', 'excerpt'),
                'capability_type'    => 'post',
                'map_meta_cap'       => true,
                'has_archive'        => false,
                'rewrite'            => false,
                'can_export'         => true,
                'delete_with_user'   => false,
            ));
        }
    }

    /**
     * Normalize an editor-provided slug and guarantee uniqueness per CPT.
     */
    public static function unique_slug($cpt, $raw_slug, $post_id, $fallback_title) {
        $slug = strtolower(trim((string) $raw_slug));
        $slug = preg_replace('/[^a-z0-9-]+/', '-', $slug);
        $slug = trim($slug, '-');
        if ($slug === '') {
            $slug = sanitize_title((string) $fallback_title);
        }
        if ($slug === '') {
            $slug = 'item';
        }
        $base = $slug;
        $n = 2;
        while (self::slug_taken($cpt, $slug, $post_id)) {
            $slug = $base . '-' . $n;
            $n++;
        }
        return $slug;
    }

    private static function slug_taken($cpt, $slug, $ignore_id) {
        $q = new WP_Query(array(
            'post_type'      => $cpt,
            'post_status'    => array('publish', 'draft', 'pending', 'private'),
            'meta_key'       => self::META_SLUG,
            'meta_value'     => $slug,
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'no_found_rows'  => true,
        ));
        foreach ($q->posts as $id) {
            if ((int) $id !== (int) $ignore_id) {
                return true;
            }
        }
        return false;
    }

    /**
     * Accept only absolute http(s) URLs for externally hosted files
     * (e.g. Cloudflare R2). Returns the cleaned URL or "".
     */
    public static function sanitize_external_url($raw) {
        $url = trim((string) $raw);
        if ($url === '') {
            return '';
        }
        $url = esc_url_raw($url, array('http', 'https'));
        if ($url === '') {
            return '';
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = (string) parse_url($url, PHP_URL_HOST);
        if (!in_array($scheme, array('http', 'https'), true) || $host === '') {
            return '';
        }
        return $url;
    }

    /**
     * Best-effort Content-Length for an external URL (HEAD request, 10s cap).
     * Returns int bytes or 0 when unknown. Never throws.
     */
    public static function probe_external_size($url) {
        try {
            if (!function_exists('wp_remote_head')) {
                return 0;
            }
            $res = wp_remote_head($url, array('timeout' => 10, 'redirection' => 3));
            if (is_wp_error($res)) {
                return 0;
            }
            $len = wp_remote_retrieve_header($res, 'content-length');
            if (is_array($len)) {
                $len = reset($len);
            }
            $len = (int) $len;
            return $len > 0 ? $len : 0;
        } catch (Exception $e) {
            return 0;
        }
    }

    /**
     * Refresh size/hash metadata for an item. Attachments are hashed locally
     * (chunked, memory-safe); external URLs keep their manually entered hash
     * and get a best-effort size probe.
     */
    public static function refresh_file_meta($post_id, $file_id, $external_url = '', $manual_sha = '') {
        $external_url = self::sanitize_external_url($external_url);
        if ($external_url !== '') {
            // External file wins: drop any attachment so one source of truth remains.
            delete_post_meta($post_id, self::META_FILE_ID);
            update_post_meta($post_id, self::META_URL, $external_url);
            update_post_meta($post_id, self::META_SIZE, self::probe_external_size($external_url));
            update_post_meta($post_id, self::META_SHA256, strtolower(trim((string) $manual_sha)));
            return;
        }
        delete_post_meta($post_id, self::META_URL);
        delete_post_meta($post_id, self::META_SIZE);
        delete_post_meta($post_id, self::META_SHA256);
        $file_id = absint($file_id);
        if ($file_id <= 0) {
            return;
        }
        $path = get_attached_file($file_id);
        if (!is_string($path) || $path === '' || !file_exists($path) || !is_readable($path)) {
            return;
        }
        $size = filesize($path);
        if ($size !== false) {
            update_post_meta($post_id, self::META_SIZE, (int) $size);
        }
        // Hash in 1MB chunks so multi-MB Bibles never exhaust PHP memory.
        try {
            $ctx = hash_init('sha256');
            $fh = fopen($path, 'rb');
            if ($fh) {
                while (!feof($fh)) {
                    $chunk = fread($fh, 1048576);
                    if ($chunk === false) {
                        break;
                    }
                    hash_update($ctx, $chunk);
                }
                fclose($fh);
                update_post_meta($post_id, self::META_SHA256, hash_final($ctx));
            }
        } catch (Exception $e) {
            // Leave hash empty; catalog simply omits it.
        }
    }

    public static function list_items($cpt) {
        $q = new WP_Query(array(
            'post_type'      => $cpt,
            'post_status'    => 'publish',
            'posts_per_page' => 200,
            'orderby'        => 'title',
            'order'          => 'ASC',
            'no_found_rows'  => true,
        ));
        return $q->posts;
    }

    public static function find_by_slug($cpt, $slug) {
        $q = new WP_Query(array(
            'post_type'      => $cpt,
            'post_status'    => 'publish',
            'meta_key'       => self::META_SLUG,
            'meta_value'     => $slug,
            'posts_per_page' => 1,
            'no_found_rows'  => true,
        ));
        return !empty($q->posts) ? $q->posts[0] : null;
    }

    /**
     * Normalize newline-separated song titles into a clean string array.
     */
    public static function parse_titles_list($raw) {
        if (is_array($raw)) {
            $lines = $raw;
        } else {
            $lines = preg_split('/\r\n|\r|\n/', (string) $raw);
        }
        $clean = array();
        if (is_array($lines)) {
            foreach ($lines as $line) {
                $t = trim(wp_strip_all_tags((string) $line));
                if ($t !== '') {
                    $clean[] = $t;
                }
            }
        }
        return $clean;
    }

    /**
     * Extract song titles (<name> or <title> inside <song> blocks, or JSON name fields)
     * from raw XML or JSON content.
     */
    public static function extract_titles_from_raw($raw) {
        if (!is_string($raw)) {
            return array();
        }
        // Strip UTF-8 BOM if present
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        if (trim($raw) === '') {
            return array();
        }
        $titles = array();
        if (preg_match_all('/<song\b[^>]*>([\s\S]*?)<\/song>/i', $raw, $song_matches)) {
            foreach ($song_matches[1] as $block) {
                if (preg_match('/<(?:name|title)\b[^>]*>([\s\S]*?)<\/(?:name|title)>/i', $block, $m)) {
                    $val = trim($m[1]);
                    if (preg_match('/^<!\[CDATA\[([\s\S]*?)\]\]>$/', $val, $cd)) {
                        $val = $cd[1];
                    } else {
                        $val = html_entity_decode($val, ENT_QUOTES | ENT_XML1, 'UTF-8');
                    }
                    $val = trim(wp_strip_all_tags($val));
                    if ($val !== '') {
                        $titles[] = $val;
                    }
                }
            }
        } elseif (substr(ltrim($raw), 0, 1) === '[' || substr(ltrim($raw), 0, 1) === '{') {
            $decoded = json_decode($raw, true);
            $rows = is_array($decoded) ? (isset($decoded['songs']) && is_array($decoded['songs']) ? $decoded['songs'] : $decoded) : array();
            foreach ($rows as $row) {
                if (is_array($row) && !empty($row['name'])) {
                    $val = trim(wp_strip_all_tags((string) $row['name']));
                    if ($val !== '') {
                        $titles[] = $val;
                    }
                }
            }
        }
        return $titles;
    }

    /**
     * Extract song titles from an attached song pack file (up to 15 MB).
     */
    public static function extract_titles_from_file($path) {
        if (!is_string($path) || $path === '' || !file_exists($path) || !is_readable($path)) {
            return array();
        }
        $size = filesize($path);
        if ($size === false || $size <= 0 || $size > 15728640) {
            return array();
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || trim($raw) === '') {
            return array();
        }
        return self::extract_titles_from_raw($raw);
    }

    /**
     * Extract song titles from an externally hosted song pack URL (e.g. Cloudflare R2).
     */
    public static function extract_titles_from_url($url) {
        $clean_url = self::sanitize_external_url($url);
        if ($clean_url === '' || !function_exists('wp_remote_get')) {
            return array();
        }
        try {
            $res = wp_remote_get($clean_url, array(
                'timeout'     => 15,
                'redirection' => 3,
            ));
            if (is_wp_error($res)) {
                return array();
            }
            $code = (int) wp_remote_retrieve_response_code($res);
            if ($code < 200 || $code >= 300) {
                return array();
            }
            $body = wp_remote_retrieve_body($res);
            if (!is_string($body) || $body === '') {
                return array();
            }
            return self::extract_titles_from_raw($body);
        } catch (Exception $e) {
            return array();
        }
    }

    /**
     * Automatically extract and store song titles for a song pack from its
     * external URL or attached Media Library file.
     */
    public static function refresh_song_titles($post_id, $file_id, $external_url = '', $fallback_titles = array()) {
        $titles_list = array();
        $clean_url = self::sanitize_external_url($external_url);

        if ($clean_url !== '') {
            $titles_list = self::extract_titles_from_url($clean_url);
        }

        if (empty($titles_list) && absint($file_id) > 0) {
            $attached_path = get_attached_file(absint($file_id));
            if (is_string($attached_path) && $attached_path !== '') {
                $titles_list = self::extract_titles_from_file($attached_path);
            }
        }

        if (empty($titles_list) && !empty($fallback_titles)) {
            $titles_list = self::parse_titles_list($fallback_titles);
        }

        if (!empty($titles_list)) {
            update_post_meta($post_id, self::META_TITLES, implode("\n", $titles_list));
        } else {
            delete_post_meta($post_id, self::META_TITLES);
        }

        return $titles_list;
    }

    public static function describe(WP_Post $post) {
        $file_id = absint(get_post_meta($post->ID, self::META_FILE_ID, true));
        $desc = has_excerpt($post) ? get_the_excerpt($post) : '';
        if ($desc === '' && $post->post_content !== '') {
            $desc = wp_trim_words(wp_strip_all_tags($post->post_content), 30);
        }
        $item = array(
            'slug'        => (string) get_post_meta($post->ID, self::META_SLUG, true),
            'name'        => $post->post_title,
            'description' => $desc,
            'version'     => (string) get_post_meta($post->ID, self::META_VERSION, true),
            'size'        => (int) get_post_meta($post->ID, self::META_SIZE, true),
            'sha256'      => (string) get_post_meta($post->ID, self::META_SHA256, true),
            'updated'     => get_post_modified_time('c', true, $post),
            'url'         => rest_url(sprintf(
                '%s/download/%s/%s',
                UECFI_API_NS,
                $post->post_type === UECFI_API_CPT_SONG ? 'song' : 'bible',
                rawurlencode((string) get_post_meta($post->ID, self::META_SLUG, true))
            )),
        );
        if ($post->post_type === UECFI_API_CPT_SONG) {
            $raw_titles = get_post_meta($post->ID, self::META_TITLES, true);
            $titles = self::parse_titles_list($raw_titles);
            if (empty($titles)) {
                $ext_url = (string) get_post_meta($post->ID, self::META_URL, true);
                $titles = self::refresh_song_titles($post->ID, $file_id, $ext_url);
            }
            $item['titles'] = $titles;
            $item['song_count'] = count($titles);
        }
        return $item;
    }

    public static function attachment_path($post_id) {
        $file_id = absint(get_post_meta($post_id, self::META_FILE_ID, true));
        if ($file_id <= 0) {
            return null;
        }
        $path = get_attached_file($file_id);
        if (!is_string($path) || $path === '' || !file_exists($path) || !is_readable($path)) {
            return null;
        }
        return $path;
    }

    public static function default_manifest() {
        return array(
            'latest'           => '',
            'min_supported'    => '',
            'notes'            => '',
            'windows_url'      => '',
            'mac_url'          => '',
            'installer_sha256' => '',
            'windows_sha256'   => '',
            'mac_sha256'       => '',
        );
    }

    public static function get_manifest() {
        $saved = get_option(UECFI_API_OPT_MANIFEST, array());
        if (!is_array($saved)) {
            $saved = array();
        }
        return array_merge(self::default_manifest(), $saved);
    }
}
