<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


/*
 * Temucraft issues and feature requests (?issues)
 *
 * Signed in site users post a bug or a feature request (title, kind, text). Everyone can read them. Staff (site
 * admins and moderators) set the status (open, planned, fixed, won't fix), reply, and can delete spam.
 * Every POST needs the session's dataKey (the same key the site gives its scripts) as "t", so another site can't
 * post for a signed in user. Posting is limited per user (issues_post_limit in issues_post_window seconds, and
 * issues_post_gap seconds between two posts).
 *
 * Tables: aowow_issues, aowow_issue_replies (setup/updates/2026_11_21_12.sql).
 */
class TemucraftIssues
{
    public const KIND_BUG     = 1;
    public const KIND_FEATURE = 2;
    public const KINDS        = [self::KIND_BUG => 'Bug', self::KIND_FEATURE => 'Feature request'];
    public const STATUSES     = [0 => 'Open', 1 => 'Planned', 2 => 'Fixed', 3 => "Won't fix"];

    public const TITLE_MIN = 5;
    public const TITLE_MAX = 120;
    public const TEXT_MIN  = 10;
    public const TEXT_MAX  = 5000;
    public const LIST_MAX  = 500;

    private const SETTINGS = ['issues_post_limit' => 3, 'issues_post_window' => 3600, 'issues_post_gap' => 60];

    public static function isStaff() : bool
    {
        return User::$id && User::isInGroup(U_GROUP_ADMIN | U_GROUP_MOD);
    }

    public static function canPost() : bool
    {
        return User::$id && !(User::$banStatus & (ACC_BAN_PERM | ACC_BAN_TEMP | ACC_BAN_COMMENT));
    }

    private static function settings() : array
    {
        $rows = DB::Aowow()->selectCol('SELECT `key` AS ARRAY_KEY, `value` FROM ?_config WHERE `key` IN (?a)', array_keys(self::SETTINGS)) ?: [];
        $out  = [];
        foreach (self::SETTINGS as $k => $default)
            $out[$k] = isset($rows[$k]) && $rows[$k] !== '' ? max(0, (int)$rows[$k]) : $default;
        return $out;
    }

    /* one line or many: no control characters but line breaks and tabs, trimmed */
    private static function clean(string $text, bool $multiLine) : string
    {
        $text = str_replace("\r\n", "\n", $text);
        $text = preg_replace($multiLine ? '/[^\P{C}\n\t]/u' : '/\p{C}/u', '', $text) ?? '';
        if (!$multiLine)
            $text = preg_replace('/\s+/u', ' ', $text) ?? '';
        return trim($text);
    }

    private static function length(string $text) : int
    {
        return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    }

    /* the session's own key must come with every POST */
    public static function checkToken(?string $t) : bool
    {
        return !empty($_SESSION['dataKey']) && is_string($t) && hash_equals((string)$_SESSION['dataKey'], $t);
    }

    /* every issue, newest first, with its replies (names only, no account details) */
    public static function all() : array
    {
        $issues = DB::Aowow()->select(
            'SELECT i.`id` AS ARRAY_KEY, i.`id`, i.`kind`, i.`status`, i.`title`, i.`body`, i.`created`, i.`updated`, IFNULL(a.`displayName`, "") AS `author`
             FROM ?_issues i LEFT JOIN ?_account a ON a.`id` = i.`userId`
             ORDER BY i.`id` DESC LIMIT ?d', self::LIST_MAX) ?: [];

        foreach ($issues as &$i)
        {
            foreach (['id', 'kind', 'status', 'created', 'updated'] as $k)
                $i[$k] = (int)$i[$k];
            $i['replies'] = [];
        }
        unset($i);

        if ($issues)
        {
            $replies = DB::Aowow()->select(
                'SELECT r.`issueId`, r.`body`, r.`created`, r.`newStatus`, IFNULL(a.`displayName`, "") AS `author`
                 FROM ?_issue_replies r LEFT JOIN ?_account a ON a.`id` = r.`userId`
                 WHERE r.`issueId` IN (?a) ORDER BY r.`id` ASC', array_keys($issues)) ?: [];
            foreach ($replies as $r)
                $issues[$r['issueId']]['replies'][] = array(
                    'body'      => $r['body'],
                    'created'   => (int)$r['created'],
                    'newStatus' => $r['newStatus'] === null ? null : (int)$r['newStatus'],
                    'author'    => $r['author']
                );
        }

        return array_values($issues);
    }

    /* a new issue; returns an error text or the new id */
    public static function post(string $title, int $kind, string $text) /* : string|int */
    {
        if (!self::canPost())
            return 'Sign in to post.';

        $title = self::clean($title, false);
        $text  = self::clean($text, true);
        if (!isset(self::KINDS[$kind]))
            return 'Pick bug or feature request.';
        if (self::length($title) < self::TITLE_MIN || self::length($title) > self::TITLE_MAX)
            return 'The title needs '.self::TITLE_MIN.' to '.self::TITLE_MAX.' characters.';
        if (self::length($text) < self::TEXT_MIN || self::length($text) > self::TEXT_MAX)
            return 'The text needs '.self::TEXT_MIN.' to '.self::TEXT_MAX.' characters.';

        if (!self::isStaff())
        {
            $cfg  = self::settings();
            $last = (int)DB::Aowow()->selectCell('SELECT MAX(`created`) FROM ?_issues WHERE `userId` = ?d', User::$id);
            if ($cfg['issues_post_gap'] && $last > time() - $cfg['issues_post_gap'])
                return 'Please wait a little before you post again.';
            $count = (int)DB::Aowow()->selectCell('SELECT COUNT(*) FROM ?_issues WHERE `userId` = ?d AND `created` > ?d', User::$id, time() - $cfg['issues_post_window']);
            if ($cfg['issues_post_limit'] && $count >= $cfg['issues_post_limit'])
                return 'You have posted a lot in a short time. Please try again later.';
        }

        $id = DB::Aowow()->query('INSERT INTO ?_issues (`userId`, `kind`, `status`, `title`, `body`, `created`, `updated`) VALUES (?d, ?d, 0, ?, ?, ?d, ?d)',
            User::$id, $kind, $title, $text, time(), time());

        return $id ? (int)$id : 'Could not save it. Please try again.';
    }

    /* staff: a reply and/or a new status; returns an error text or '' */
    public static function answer(int $id, string $text, ?int $status) : string
    {
        if (!self::isStaff())
            return 'Only staff can do that.';

        $old = DB::Aowow()->selectCell('SELECT `status` FROM ?_issues WHERE `id` = ?d', $id);
        if ($old === null || $old === false)
            return 'That issue is gone.';

        $text = self::clean($text, true);
        if ($status !== null && (!isset(self::STATUSES[$status]) || $status == (int)$old))
            $status = null;
        if ($text === '' && $status === null)
            return 'Write a reply or pick a new status.';
        if (self::length($text) > self::TEXT_MAX)
            return 'The reply can have up to '.self::TEXT_MAX.' characters.';

        DB::Aowow()->query('INSERT INTO ?_issue_replies (`issueId`, `userId`, `body`, `created`, `newStatus`) VALUES (?d, ?d, ?, ?d, ?)',
            $id, User::$id, $text, time(), $status);
        if ($status !== null)
            DB::Aowow()->query('UPDATE ?_issues SET `status` = ?d, `updated` = ?d WHERE `id` = ?d', $status, time(), $id);
        else
            DB::Aowow()->query('UPDATE ?_issues SET `updated` = ?d WHERE `id` = ?d', time(), $id);

        return '';
    }

    /* staff: removes spam with its replies */
    public static function delete(int $id) : string
    {
        if (!self::isStaff())
            return 'Only staff can do that.';

        DB::Aowow()->query('DELETE FROM ?_issue_replies WHERE `issueId` = ?d', $id);
        DB::Aowow()->query('DELETE FROM ?_issues WHERE `id` = ?d', $id);
        return '';
    }
}

?>
