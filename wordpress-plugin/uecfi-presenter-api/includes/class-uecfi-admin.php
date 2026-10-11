<?php
/**
 * WP Admin: top-level "Presenter API" menu with the app-manifest settings page,
 * plus per-item meta boxes (version, slug, file picker) on both catalog CPTs.
 */

if (!defined('ABSPATH')) {
    exit;
}

class UECFI_API_Admin {

    public static function register_menu() {
        add_menu_page(
            __('Presenter API', 'uecfi-presenter-api'),
            __('Presenter API', 'uecfi-presenter-api'),
            'manage_options',
            'uecfi-presenter-api',
            array(__CLASS__, 'render_settings'),
            'dashicons-smartphone',
            30
        );
        // Explicit landing entry: guarantees the parent click opens the
        // manifest page (never the first CPT list) and keeps highlighting
        // correct, regardless of menu position or other admin customizers.
        add_submenu_page(
            'uecfi-presenter-api',
            __('Presenter API Overview', 'uecfi-presenter-api'),
            __('Overview', 'uecfi-presenter-api'),
            'manage_options',
            'uecfi-presenter-api',
            array(__CLASS__, 'render_settings')
        );
    }

    public static function enqueue_assets($hook) {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        $on_cpt = $screen && in_array($screen->post_type, array(UECFI_API_CPT_BIBLE, UECFI_API_CPT_SONG), true);
        if (!$on_cpt) {
            return;
        }
        wp_enqueue_media();
        wp_enqueue_script(
            'uecfi-api-admin',
            UECFI_API_URL . 'assets/admin.js',
            array('jquery'),
            UECFI_API_VERSION,
            true
        );
    }

    // ---------- manifest settings page ----------

    public static function render_settings() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'uecfi-presenter-api'));
        }
        if (isset($_POST['uecfi_manifest_nonce']) && check_admin_referer('uecfi_save_manifest', 'uecfi_manifest_nonce')) {
            $manifest = array(
                'latest'           => isset($_POST['latest']) ? sanitize_text_field(wp_unslash($_POST['latest'])) : '',
                'min_supported'    => isset($_POST['min_supported']) ? sanitize_text_field(wp_unslash($_POST['min_supported'])) : '',
                'notes'            => isset($_POST['notes']) ? sanitize_textarea_field(wp_unslash($_POST['notes'])) : '',
                'windows_url'      => isset($_POST['windows_url']) ? esc_url_raw(wp_unslash($_POST['windows_url'])) : '',
                'mac_url'          => isset($_POST['mac_url']) ? esc_url_raw(wp_unslash($_POST['mac_url'])) : '',
                'installer_sha256' => isset($_POST['installer_sha256']) ? sanitize_text_field(wp_unslash($_POST['installer_sha256'])) : '',
                'windows_sha256'   => isset($_POST['windows_sha256']) ? sanitize_text_field(wp_unslash($_POST['windows_sha256'])) : '',
                'mac_sha256'       => isset($_POST['mac_sha256']) ? sanitize_text_field(wp_unslash($_POST['mac_sha256'])) : '',
            );
            update_option(UECFI_API_OPT_MANIFEST, $manifest);
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Manifest saved.', 'uecfi-presenter-api') . '</p></div>';
        }
        $m = UECFI_API_Catalog::get_manifest();
        $base = esc_url(rest_url(UECFI_API_NS));
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Presenter API', 'uecfi-presenter-api'); ?></h1>

            <h2 class="title"><?php esc_html_e('Endpoints (public, read-only)', 'uecfi-presenter-api'); ?></h2>
            <table class="widefat striped" style="max-width:900px;">
                <thead><tr><th><?php esc_html_e('Route', 'uecfi-presenter-api'); ?></th><th><?php esc_html_e('Purpose', 'uecfi-presenter-api'); ?></th></tr></thead>
                <tbody>
                    <tr><td><code><?php echo esc_html($base); ?>/app</code></td><td><?php esc_html_e('App-update manifest (latest version, installer URLs, changelog).', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/bibles</code></td><td><?php esc_html_e('Bible catalog (slug, name, version, size, sha256, download URL).', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/bibles/&lt;slug&gt;</code></td><td><?php esc_html_e('Single Bible entry.', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/songs</code></td><td><?php esc_html_e('Song-pack catalog (same shape).', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/songs/&lt;slug&gt;</code></td><td><?php esc_html_e('Single song-pack entry.', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/download/bible/&lt;slug&gt;</code></td><td><?php esc_html_e('Bible file download.', 'uecfi-presenter-api'); ?></td></tr>
                    <tr><td><code><?php echo esc_html($base); ?>/download/song/&lt;slug&gt;</code></td><td><?php esc_html_e('Song-pack file download.', 'uecfi-presenter-api'); ?></td></tr>
                </tbody>
            </table>
            <p class="description"><?php esc_html_e('Add content under the “Bibles” and “Song Packs” menu items. Only Published entries appear in the catalog.', 'uecfi-presenter-api'); ?></p>

            <h2 class="title"><?php esc_html_e('App-update manifest', 'uecfi-presenter-api'); ?></h2>
            <form method="post" action="">
                <?php wp_nonce_field('uecfi_save_manifest', 'uecfi_manifest_nonce'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="uecfi-latest"><?php esc_html_e('Latest version', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="latest" id="uecfi-latest" type="text" class="regular-text" value="<?php echo esc_attr($m['latest']); ?>" placeholder="3.3.0"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-min"><?php esc_html_e('Minimum supported', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="min_supported" id="uecfi-min" type="text" class="regular-text" value="<?php echo esc_attr($m['min_supported']); ?>" placeholder="3.0.0"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-notes"><?php esc_html_e('Release notes', 'uecfi-presenter-api'); ?></label></th>
                        <td><textarea name="notes" id="uecfi-notes" rows="4" cols="50" class="large-text"><?php echo esc_textarea($m['notes']); ?></textarea></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-win"><?php esc_html_e('Windows installer URL', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="windows_url" id="uecfi-win" type="url" class="large-text" value="<?php echo esc_attr($m['windows_url']); ?>" placeholder="https://…/setup.exe"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-mac"><?php esc_html_e('Mac installer URL', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="mac_url" id="uecfi-mac" type="url" class="large-text" value="<?php echo esc_attr($m['mac_url']); ?>" placeholder="https://…/app.dmg"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-sha"><?php esc_html_e('Installer SHA-256 (legacy, single file)', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="installer_sha256" id="uecfi-sha" type="text" class="large-text code" value="<?php echo esc_attr($m['installer_sha256']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-winsha"><?php esc_html_e('Windows installer SHA-256', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="windows_sha256" id="uecfi-winsha" type="text" class="large-text code" value="<?php echo esc_attr($m['windows_sha256']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="uecfi-macsha"><?php esc_html_e('Mac installer SHA-256', 'uecfi-presenter-api'); ?></label></th>
                        <td><input name="mac_sha256" id="uecfi-macsha" type="text" class="large-text code" value="<?php echo esc_attr($m['mac_sha256']); ?>"></td>
                    </tr>
                </table>
                <?php submit_button(__('Save Manifest', 'uecfi-presenter-api')); ?>
            </form>
        </div>
        <?php
    }

    // ---------- item meta boxes ----------

    public static function register_meta_boxes() {
        foreach (array(UECFI_API_CPT_BIBLE, UECFI_API_CPT_SONG) as $cpt) {
            add_meta_box(
                'uecfi-item-data',
                __('Release Details', 'uecfi-presenter-api'),
                array(__CLASS__, 'render_meta_box'),
                $cpt,
                'normal',
                'high'
            );
        }
    }

    public static function render_meta_box(WP_Post $post) {
        wp_nonce_field('uecfi_save_item', 'uecfi_item_nonce');
        $version = get_post_meta($post->ID, UECFI_API_Catalog::META_VERSION, true);
        $slug    = get_post_meta($post->ID, UECFI_API_Catalog::META_SLUG, true);
        $file_id = absint(get_post_meta($post->ID, UECFI_API_Catalog::META_FILE_ID, true));
        $ext_url = get_post_meta($post->ID, UECFI_API_Catalog::META_URL, true);
        $size    = get_post_meta($post->ID, UECFI_API_Catalog::META_SIZE, true);
        $sha     = get_post_meta($post->ID, UECFI_API_Catalog::META_SHA256, true);
        $file_name = $file_id ? basename((string) get_attached_file($file_id)) : '';
        ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><label for="uecfi-version"><?php esc_html_e('Version', 'uecfi-presenter-api'); ?></label></th>
                <td><input name="uecfi_version" id="uecfi-version" type="text" class="regular-text" value="<?php echo esc_attr($version); ?>" placeholder="1.0"></td>
            </tr>
            <tr>
                <th scope="row"><label for="uecfi-slug"><?php esc_html_e('URL slug', 'uecfi-presenter-api'); ?></label></th>
                <td>
                    <input name="uecfi_slug" id="uecfi-slug" type="text" class="regular-text code" value="<?php echo esc_attr($slug); ?>" placeholder="kjv-tagalog">
                    <p class="description"><?php esc_html_e('Lowercase letters, numbers, dashes. Auto-filled from the title; kept unique automatically.', 'uecfi-presenter-api'); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e('File', 'uecfi-presenter-api'); ?></th>
                <td>
                    <input type="hidden" name="uecfi_file_id" id="uecfi-file-id" value="<?php echo esc_attr($file_id); ?>">
                    <p><strong id="uecfi-file-name"><?php echo $file_name ? esc_html($file_name) : esc_html__('No file selected.', 'uecfi-presenter-api'); ?></strong></p>
                    <p>
                        <button type="button" class="button" id="uecfi-pick-file"><?php esc_html_e('Choose File…', 'uecfi-presenter-api'); ?></button>
                        <button type="button" class="button" id="uecfi-clear-file"><?php esc_html_e('Remove', 'uecfi-presenter-api'); ?></button>
                    </p>
                    <p>
                        <label for="uecfi-file-url"><?php esc_html_e('…or paste an external file URL (e.g. Cloudflare R2). Takes precedence over the library file above.', 'uecfi-presenter-api'); ?></label><br>
                        <input name="uecfi_file_url" id="uecfi-file-url" type="url" class="large-text code" value="<?php echo esc_attr($ext_url); ?>" placeholder="https://downloads.uecfi.net/bibles/kjv-tagalog.xml">
                    </p>
                    <p>
                        <label for="uecfi-file-sha"><?php esc_html_e('SHA-256 (only needed for external URLs; attachments are hashed automatically).', 'uecfi-presenter-api'); ?></label><br>
                        <input name="uecfi_file_sha" id="uecfi-file-sha" type="text" class="large-text code" value="<?php echo esc_attr($sha); ?>" placeholder="<?php esc_attr_e('optional 64-char hex', 'uecfi-presenter-api'); ?>">
                    </p>
                    <?php if ($size !== '' || $sha !== '') : ?>
                    <p class="description">
                        <?php
                        printf(
                            /* translators: 1: file size, 2: sha256 hash */
                            esc_html__('Stored file: %1$s bytes, SHA-256 %2$s.', 'uecfi-presenter-api'),
                            esc_html((string) $size),
                            esc_html((string) $sha)
                        );
                        ?>
                    </p>
                    <?php endif; ?>
                </td>
            </tr>
        </table>
        <?php
    }

    public static function save_item_meta($post_id, WP_Post $post) {
        if (!isset($_POST['uecfi_item_nonce']) || !check_admin_referer('uecfi_save_item', 'uecfi_item_nonce')) {
            return;
        }
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        if (wp_is_post_revision($post_id)) {
            return;
        }
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }

        $version = isset($_POST['uecfi_version']) ? sanitize_text_field(wp_unslash($_POST['uecfi_version'])) : '';
        update_post_meta($post_id, UECFI_API_Catalog::META_VERSION, $version);

        $raw_slug = isset($_POST['uecfi_slug']) ? sanitize_text_field(wp_unslash($_POST['uecfi_slug'])) : '';
        $slug = UECFI_API_Catalog::unique_slug($post->post_type, $raw_slug, $post_id, $post->post_title);
        update_post_meta($post_id, UECFI_API_Catalog::META_SLUG, $slug);

        $file_id = isset($_POST['uecfi_file_id']) ? absint($_POST['uecfi_file_id']) : 0;
        update_post_meta($post_id, UECFI_API_Catalog::META_FILE_ID, $file_id);
        $ext_url = isset($_POST['uecfi_file_url']) ? sanitize_text_field(wp_unslash($_POST['uecfi_file_url'])) : '';
        $manual_sha = isset($_POST['uecfi_file_sha']) ? sanitize_text_field(wp_unslash($_POST['uecfi_file_sha'])) : '';
        $manual_sha = strtolower(trim($manual_sha));
        if ($manual_sha !== '' && !preg_match('/^[0-9a-f]{64}$/', $manual_sha)) {
            $manual_sha = '';
        }
        UECFI_API_Catalog::refresh_file_meta($post_id, $file_id, $ext_url, $manual_sha);
    }

    /**
     * Allow .xml uploads while managing catalog items (Bible releases are XML).
     * Scoped to our post types so the site-wide upload policy is untouched:
     * matches the edit screen itself and async media-modal uploads carrying
     * the edited item's post ID. Administrators can already upload anything
     * via unfiltered_upload; this covers editors/shop-style roles without it.
     * Note: on Multisite the network "Upload file types" list still applies —
     * add `xml` there too (Network Admin → Settings).
     */
    public static function allow_xml_uploads($mimes) {
        if (!is_array($mimes)) {
            return $mimes;
        }
        $types = array(UECFI_API_CPT_BIBLE, UECFI_API_CPT_SONG);
        try {
            if (function_exists('get_current_screen')) {
                $screen = get_current_screen();
                if ($screen && isset($screen->post_type) && in_array($screen->post_type, $types, true)) {
                    $mimes['xml'] = 'text/xml';
                    return $mimes;
                }
            }
        } catch (Exception $e) {
            // Fall through to the request-context check below.
        }
        if (isset($_REQUEST['post_id'])) {
            $parent_id = absint($_REQUEST['post_id']);
            if ($parent_id > 0 && function_exists('get_post_type')) {
                $parent_type = get_post_type($parent_id);
                if (in_array($parent_type, $types, true)) {
                    $mimes['xml'] = 'text/xml';
                }
            }
        }
        return $mimes;
    }
}
