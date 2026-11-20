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
        $this->config['data'] = ['notes' => $data['notes'] ?? [], 'skills' => $data['skills'] ?? [], 'classes' => $classes];
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
