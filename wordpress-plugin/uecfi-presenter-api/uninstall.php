<?php
/**
 * Uninstall cleanup: remove the manifest option. Catalog posts and uploaded
 * files are intentionally left behind so uninstalling never destroys content.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('uecfi_api_manifest');
