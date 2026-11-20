<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

require_once 'includes/realmstatus.class.php';


// tabId 1: Tools g_initHeader()
// Player map: the characters online right now as dots on the continent maps (and on the zone maps of our extra
// open world zones), refreshed every 30 s. See includes/realmstatus.class.php for what is shown and who is hidden.
//   ?player-map=data             online characters (JSON, cached 30 s): name, level, race, class, gender, side, zone,
//                                guild, and x/y in % of the zone map (open world only)
//   ?player-map=hide             POST realm, guid, hide (0/1): hide or show one of your own characters (linked
//                                game account, same link as the quest tracker)
// Config: playermap_enable (0 turns the page and its data off), playermap_guilds, playermap_hide_staff.
class PlayerMapPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 19];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/realmstatus.js'],
        [SC_CSS_FILE, 'css/realmstatus.css']
    );

    protected $toolId   = 'player-map';
    protected $toolInit = 'AoPlayerMap.init';
    protected $config   = [];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        $param = (string)$pageParam;
        if ($param == 'data')
        {
            $data = RealmStatus::mapData();
            $data['zones'] = (object)RealmStatus::zoneNames(array_column($data['players'], 'zone'));
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: public, max-age='.RealmStatus::CACHE);
            exit(Util::toJSON($data));
        }

        if ($param == 'hide')
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, no-store');
            if ($_SERVER['REQUEST_METHOD'] != 'POST')
                exit(Util::toJSON(['error' => 'POST only']));
            exit(Util::toJSON(['error' => RealmStatus::setHidden((int)($_POST['realm'] ?? 0), (int)($_POST['guid'] ?? 0), !empty($_POST['hide']))]));
        }

        $this->name   = Lang::main('playerMap');
        $this->config = array(
            'host'     => Cfg::get('HOST_URL'),
            'enabled'  => RealmStatus::mapEnabled(),
            'names'    => RealmStatus::names(),
            'loggedIn' => (bool)User::$id,
            'own'      => RealmStatus::mapEnabled() ? RealmStatus::ownCharacters() : []
        );
    }

    protected function generateContent()
    {
        // zone outlines with each zone's rect on its continent: places zone map coords on the continent maps
        if (RealmStatus::mapEnabled())
            $this->addScript([SC_JS_FILE, '?data=zone-shapes']);
    }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
