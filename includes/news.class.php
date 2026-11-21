<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


/*
 * Temucraft launcher news (?news)
 *
 * The launcher reads news.json and changelog.json next to its manifest.json on the server's file host; this page
 * reads the same two files. news_source in aowow_config is either the address of that folder
 * (https://files.example.com/wow/) or a folder on this machine (/var/www/wow-files). The files are kept in the
 * cache folder for news_cache seconds, and the last good copy is shown when the source can't be reached.
 *
 * Each file is a list of {"date": "YYYY-MM-DD", "title": "...", "text": "...", "link": "https://..."}, newest first.
 */
class TemucraftNews
{
    public const FILES = ['news' => 'news.json', 'changelog' => 'changelog.json'];
    private const MAX_BYTES = 2097152;  // 2 MB is far more than a news file needs

    private static $settings = null;

    /* read straight from aowow_config, so the page still works (empty) before the update SQL is applied */
    private static function setting(string $key) : string
    {
        if (self::$settings === null)
            self::$settings = DB::Aowow()->selectCol('SELECT `key` AS ARRAY_KEY, `value` FROM ?_config WHERE `key` IN (?a)', ['news_source', 'news_cache']) ?: [];

        return trim((string)(self::$settings[$key] ?? ''));
    }

    public static function source() : string
    {
        return self::setting('news_source');
    }

    private static function cacheSeconds() : int
    {
        $s = (int)self::setting('news_cache');
        return $s > 0 ? $s : 300;
    }

    private static function cacheFile(string $what) : string
    {
        $dir = Cfg::get('CACHE_DIR') ?: 'cache/template';
        return rtrim($dir, '/').'/launcher-'.$what.'.json';
    }

    /* the raw text of one file from the source; null when it can't be read */
    private static function fetch(string $file) : ?string
    {
        $src = self::source();
        if ($src === '')
            return null;

        if (preg_match('#^https?://#i', $src))
        {
            $url = rtrim($src, '/').'/'.$file;
            if (function_exists('curl_init'))
            {
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_MAXREDIRS      => 3,
                    CURLOPT_CONNECTTIMEOUT => 4,
                    CURLOPT_TIMEOUT        => 6,
                    CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                    CURLOPT_USERAGENT      => 'Temucraft website'
                ]);
                $text = curl_exec($ch);
                $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                return is_string($text) && $code == 200 && strlen($text) <= self::MAX_BYTES ? $text : null;
            }

            $ctx  = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 6, 'ignore_errors' => true, 'header' => "User-Agent: Temucraft website\r\n"]]);
            $text = @file_get_contents($url, false, $ctx, 0, self::MAX_BYTES + 1);
            $ok   = isset($http_response_header[0]) && preg_match('#\s200\s#', $http_response_header[0]);
            return is_string($text) && $ok && strlen($text) <= self::MAX_BYTES ? $text : null;
        }

        $path = rtrim($src, '/\\').DIRECTORY_SEPARATOR.$file;
        if (!is_file($path) || filesize($path) > self::MAX_BYTES)
            return null;

        $text = @file_get_contents($path);
        return is_string($text) ? $text : null;
    }

    /* only the fields the page shows, as plain strings; links only when they are http(s) */
    private static function clean($json) : ?array
    {
        if (!is_array($json))
            return null;

        $out = [];
        foreach ($json as $e)
        {
            if (!is_array($e))
                continue;

            $item = [];
            foreach (['date', 'title', 'text', 'link'] as $k)
                $item[$k] = isset($e[$k]) && is_scalar($e[$k]) ? trim((string)$e[$k]) : '';

            if (!preg_match('#^https?://#i', $item['link']))
                $item['link'] = '';

            if ($item['title'] !== '' || $item['text'] !== '')
                $out[] = $item;
        }
        return $out;
    }

    /* one file's entries: from the cache while it is fresh, else from the source, else the last good copy */
    public static function entries(string $what, ?bool &$stale = null) : array
    {
        $stale = false;
        if (!isset(self::FILES[$what]))
            return [];

        $cache = self::cacheFile($what);
        $old   = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
        if (is_array($old) && isset($old['items']) && filemtime($cache) > time() - self::cacheSeconds())
            return $old['items'];

        $text = self::fetch(self::FILES[$what]);
        if ($text !== null)
        {
            $text  = preg_replace('/^\xEF\xBB\xBF/', '', $text);  // a byte order mark from a Windows editor
            $items = self::clean(json_decode($text, true));
            if ($items !== null)
            {
                @file_put_contents($cache, json_encode(['fetched' => time(), 'items' => $items]), LOCK_EX);
                return $items;
            }
        }

        // the source is down or the file is broken: keep showing the last good copy, and try again later
        if (is_array($old) && isset($old['items']))
        {
            $stale = true;
            @touch($cache, time() - self::cacheSeconds() + 60);
            return $old['items'];
        }

        return [];
    }

    public static function data() : array
    {
        $out = ['configured' => self::source() !== '', 'generated' => time(), 'stale' => false];
        foreach (array_keys(self::FILES) as $what)
        {
            $out[$what] = self::entries($what, $stale);
            $out['stale'] = $out['stale'] || $stale;
        }
        return $out;
    }
}

?>
