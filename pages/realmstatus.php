<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

require_once 'includes/realmstatus.class.php';


// tabId 1: Tools g_initHeader()
// Realm status: per realm online or not (a short connect to the worldserver port), players online, all-time peak,
// uptime, factions, classes, races and the level spread. Counts only, nothing about single players.
//   ?realm-status=data           the same as JSON (cached 30 s); the launcher reads this
class RealmStatusPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 18];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/realmstatus.js'],
        [SC_CSS_FILE, 'css/realmstatus.css']
    );

    protected $toolId   = 'realm-status';
    protected $toolInit = 'AoRealmStatus.init';
    protected $config   = [];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        if ((string)$pageParam == 'data')
        {
            $data = RealmStatus::status();
            $data['names']      = RealmStatus::names();
            $data['mapEnabled'] = RealmStatus::mapEnabled();
            $data['mapUrl']     = Cfg::get('HOST_URL').'/?player-map';
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: public, max-age='.RealmStatus::CACHE);
            header('Access-Control-Allow-Origin: *');
            exit(Util::toJSON($data));
        }

        $this->name   = Lang::main('realmStatus');
        $this->config = ['host' => Cfg::get('HOST_URL'), 'mapEnabled' => RealmStatus::mapEnabled()];
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
