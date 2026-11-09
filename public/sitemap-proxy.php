<?php
declare(strict_types=1);

$backendSitemap = 'https://nextgenies-com-612029.hostingersite.com/sitemap.xml';
$body = false;
$status = 502;

for ($attempt = 0; $attempt < 2 && $status !== 200; $attempt++) {
    if (function_exists('curl_init')) {
        $curl = curl_init($backendSitemap . '?proxy_attempt=' . ($attempt + 1));
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_HTTPHEADER => ['Accept: application/xml', 'Cache-Control: no-cache'],
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 15,
                'header' => "Accept: application/xml\r\nCache-Control: no-cache\r\n",
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($backendSitemap . '?proxy_attempt=' . ($attempt + 1), false, $context);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) {
            $status = (int) $match[1];
        }
    }
    if ($status !== 200 && $attempt === 0) usleep(250000);
}

if ($status < 200 || $status >= 300 || !is_string($body) || trim($body) === '') {
    $fallback = __DIR__ . '/sitemap.xml';
    if (is_readable($fallback)) {
        http_response_code(200);
        header('Content-Type: application/xml; charset=utf-8');
        header('Cache-Control: no-cache, max-age=0, must-revalidate');
        readfile($fallback);
        exit;
    }
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo "Sitemap backend unavailable.";
    exit;
}

http_response_code(200);
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
echo $body;
