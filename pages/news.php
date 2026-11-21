<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

require_once 'includes/news.class.php';


// tabId 1: Tools g_initHeader()
// Launcher news: the news and changelog the launcher shows, read from the same news.json and changelog.json on the
// server's file host (news_source in aowow_config), with changelog tags coloured like the launcher.
//   ?news=data                   the same as JSON
class NewsPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 21];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/news.js'],
        [SC_CSS_FILE, 'css/news.css']
    );

    protected $toolId   = 'news';
    protected $toolInit = 'AoNews.init';
    protected $config   = [];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        if ((string)$pageParam == 'data')
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: public, max-age=60');
            exit(Util::toJSON(TemucraftNews::data()));
        }

        $this->name   = Lang::main('launcherNews');
        $this->config = TemucraftNews::data();
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
