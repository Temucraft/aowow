<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


// tabId 1: Tools g_initHeader()
// Temucraft changes: what is different from stock 3.3.5, per class (like Wowhead's WoW Classic "Forever" changes).
//   ?changes                         overview: general changes, weapon/armor skills, one box per class
//   ?changes=spellbook.<class>       new, updated and removed spells of a class, old and new side by side per rank
//   ?changes=talents.<class>         the talent trees with new talents marked, and the talent changes
// The data comes from setup/temucraft/changes.json, made by setup/tools/temucraft-changes.py from the DBCs (stock
// against ours) and the world database (class trainers, spell scripts), plus setup/temucraft/changes-notes.json.
class ChangesPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 17];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/changes.js'],
        [SC_CSS_FILE, 'css/changes.css']
    );

    protected $toolId   = 'changes';
    protected $toolInit = 'AoChanges.init';
    protected $config   = [];

    public const DATA   = 'setup/temucraft/changes.json';
    public const SLUGS  = [1 => 'warrior', 2 => 'paladin', 3 => 'hunter', 4 => 'rogue', 5 => 'priest', 6 => 'death-knight', 7 => 'shaman', 8 => 'mage', 9 => 'warlock', 11 => 'druid'];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        $data = self::load();
        $this->name   = Lang::main('changes');
        $this->config = ['host' => Cfg::get('HOST_URL'), 'slugs' => self::SLUGS];

        if (!$data)
        {
            $this->config['view']  = 'missing';
            return;
        }

        $this->config['generated'] = $data['generated'] ?? '';

        $param = explode('.', (string)$pageParam);
        $cls   = array_search($param[1] ?? '', self::SLUGS);
        if (in_array($param[0], ['spellbook', 'talents']) && $cls && isset($data['classes'][$cls]))
        {
            $c = $data['classes'][$cls];
            $this->config['view']  = $param[0];
            $this->config['class'] = $cls;
            $this->config['data']  = array(
                'name'    => $c['name'],
                'notes'   => $c['notes'] ?? [],
                'spells'  => $param[0] == 'spellbook' ? $c['spells'] : null,
                'talents' => $param[0] == 'talents' ? $c['talents'] : null,
                'trees'   => $param[0] == 'talents' ? ($c['trees'] ?? []) : null
            );
            $this->name .= ' - '.$c['name'].' '.($param[0] == 'spellbook' ? 'Spellbook' : 'Talents');
            return;
        }

        // overview: counts only
        $classes = [];
        foreach ($data['classes'] as $id => $c)
        {
            $classes[] = array(
                'id'      => (int)$id,
                'name'    => $c['name'],
                'spells'  => array_map('count', $c['spells']),
                'talents' => array_map('count', $c['talents']),
                'notes'   => count($c['notes'] ?? [])
            );
        }
        $this->config['view'] = 'overview';
        $this->config['data'] = array(
            'notes'   => $data['notes'] ?? [],
            'skills'  => $data['skills'] ?? [],
            'classes' => $classes,
            'search'  => self::searchList($data),
            'links'   => self::linkNames($data),
            'log'     => self::changelog()
        );
    }

    // every class change in one flat list for the search box: [name, class id, kind, view, spell id]
    private static function searchList(array $data) : array
    {
        $out = [];
        foreach ($data['classes'] as $id => $c)
        {
            foreach (['new', 'updated', 'removed'] as $kind)
            {
                foreach ($c['spells'][$kind] ?? [] as $g)
                    $out[] = [$g['name'], (int)$id, $kind, 'spellbook', (int)($g['ranks'][0]['id'] ?? 0)];
                foreach ($c['talents'][$kind] ?? [] as $t)
                    $out[] = [$t['name'], (int)$id, $kind, 'talents', (int)(($t['new'] ?? $t['old'])['ranks'][0] ?? 0)];
            }
        }
        return $out;
    }

    // spell names the notes and the change log may name: name => spell id (names of 4 letters or more, used once)
    private static function linkNames(array $data) : array
    {
        $seen = [];
        foreach ($data['classes'] as $c)
            foreach (['new', 'updated'] as $kind)
            {
                foreach ($c['spells'][$kind] ?? [] as $g)
                    $seen[$g['name']][(int)($g['ranks'][0]['id'] ?? 0)] = 1;
                foreach ($c['talents'][$kind] ?? [] as $t)
                    $seen[$t['name']][(int)(($t['new'] ?? $t['old'])['ranks'][0] ?? 0)] = 1;
            }

        $out = [];
        foreach ($seen as $name => $ids)
            if (mb_strlen($name) >= 4 && count($ids) == 1 && key($ids))
                $out[$name] = key($ids);
        return $out;
    }

    // the release change log (the launcher's changelog.json, see includes/news.class.php): date, title and lines,
    // each line with its area tag ("[New] ...", "[Fixed] ...") split off
    private static function changelog() : array
    {
        if (!class_exists('TemucraftNews'))
            require_once 'includes/news.class.php';

        $out = [];
        foreach (TemucraftNews::entries('changelog') as $e)
        {
            $lines = [];
            foreach (preg_split('/\r?\n/', $e['text']) as $line)
            {
                if (trim($line) === '')
                    continue;
                $sub = (bool)preg_match('/^\s+[-*]/', $line);
                $line = trim(preg_replace('/^\s*(?:[\x{2022}*-]\s*)/u', '', $line));
                $tag  = '';
                if (preg_match('/^\[([^\]]{1,24})\]\s*(.*)$/u', $line, $m))
                    [$tag, $line] = [$m[1], $m[2]];
                if ($sub && $lines)
                    $lines[count($lines) - 1]['sub'][] = $line;
                else
                    $lines[] = ['tag' => $tag, 'text' => $line, 'sub' => []];
            }
            $out[] = ['date' => $e['date'], 'title' => $e['title'], 'lines' => $lines];
        }

        usort($out, fn($a, $b) => strcmp($b['date'], $a['date']));
        return $out;
    }

    private static function load() : ?array
    {
        if (!is_file(self::DATA))
            return null;

        $data = json_decode(file_get_contents(self::DATA), true);
        return is_array($data) ? $data : null;
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
