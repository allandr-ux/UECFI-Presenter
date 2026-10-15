<?php
/**
 * Plugin Name: UECFI Presenter API
 * Description: Versioned REST API for the UECFI Presenter desktop app: app-update manifest, Bible catalog, and song-pack catalog with downloads.
 * Version: 1.0.4
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: UECFI
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: uecfi-presenter-api
 */

if (!defined('ABSPATH')) {
    exit;
}

define('UECFI_API_VERSION', '1.0.4');
define('UECFI_API_NS', 'uecfi/v1');
define('UECFI_API_DIR', plugin_dir_path(__FILE__));
define('UECFI_API_URL', plugin_dir_url(__FILE__));
define('UECFI_API_CPT_BIBLE', 'uecfi_bible');
define('UECFI_API_CPT_SONG', 'uecfi_songpack');
define('UECFI_API_OPT_MANIFEST', 'uecfi_api_manifest');

require_once UECFI_API_DIR . 'includes/class-uecfi-catalog.php';
require_once UECFI_API_DIR . 'includes/class-uecfi-api.php';
require_once UECFI_API_DIR . 'includes/class-uecfi-admin.php';

add_action('init', array('UECFI_API_Catalog', 'register_post_types'));

add_action('rest_api_init', array('UECFI_API', 'register_routes'));

if (is_admin()) {
    add_action('admin_menu', array('UECFI_API_Admin', 'register_menu'));
    add_action('add_meta_boxes', array('UECFI_API_Admin', 'register_meta_boxes'));
    add_action('save_post_' . UECFI_API_CPT_BIBLE, array('UECFI_API_Admin', 'save_item_meta'), 10, 2);
    add_action('save_post_' . UECFI_API_CPT_SONG, array('UECFI_API_Admin', 'save_item_meta'), 10, 2);
    add_action('admin_enqueue_scripts', array('UECFI_API_Admin', 'enqueue_assets'));
    // Bible releases are XML files: allow .xml uploads while managing catalog
    // items (scoped so the rest of the site's upload policy is untouched).
    add_filter('upload_mimes', array('UECFI_API_Admin', 'allow_xml_uploads'));
}
