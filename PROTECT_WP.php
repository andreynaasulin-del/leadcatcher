<?php
/**
 * SECURITY PATCH FOR NEWTIDE.AI
 * Place this in your WordPress theme's functions.php file.
 */

// 1. Disable REST API for non-authenticated users
add_filter('rest_authentication_errors', function($result) {
    if (!empty($result)) {
        return $result;
    }
    if (!is_user_logged_in()) {
        return new WP_Error('rest_not_logged_in', 'You are not allowed to access this API.', array('status' => 401));
    }
    return $result;
});

// 2. Hide User Endpoints specifically
add_filter('rest_endpoints', function($endpoints) {
    if (isset($endpoints['/wp/v2/users'])) {
        unset($endpoints['/wp/v2/users']);
    }
    if (isset($endpoints['/wp/v2/users/(?P<id>[\d]+)'])) {
        unset($endpoints['/wp/v2/users/(?P<id>[\d]+)']);
    }
    return $endpoints;
});

// 3. Simple XSS Protection
header("X-XSS-Protection: 1; mode=block");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
