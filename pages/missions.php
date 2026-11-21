<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

require_once 'includes/missions.class.php';


// tabId 1: Tools g_initHeader()
// Mission table guide: every follower you can find (and how), every mission, the threats and the abilities that
// counter them, all traits, and a success chance calculator that gives the same number as the server.
// Public: no account needed. Your own followers and missions are on ?companion.
//   ?missions=data               followers, missions, names, trait table and chance settings (JSON)
class MissionsPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 20];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/missionchance.js'],
        [SC_JS_FILE,  'js/missions.js'],
        [SC_CSS_FILE, 'css/tools.css'],
        [SC_CSS_FILE, 'css/missions.css']
    );

    protected $toolId   = 'missions';
    protected $toolInit = 'AoMissions.init';
    protected $config   = [];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        if ((string)$pageParam == 'data')
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: public, max-age=300');
            exit(Util::toJSON(TemucraftMissions::publicData()));
        }

        $this->name   = Lang::main('missions');
        $this->config = ['host' => Cfg::get('HOST_URL'), 'staticUrl' => Cfg::get('STATIC_URL')];
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
