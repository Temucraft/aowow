<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

require_once 'includes/issues.class.php';


// tabId 1: Tools g_initHeader()
// Issues and feature requests: signed in users post a bug or an idea, everyone reads them, staff set the status and
// reply. See includes/issues.class.php.
//   ?issues=data                 every issue with its replies (JSON)
//   ?issues=post                 POST t, kind, title, text
//   ?issues=answer               POST t, id, text, status (staff)
//   ?issues=delete               POST t, id (staff)
class IssuesPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 22];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/issues.js'],
        [SC_CSS_FILE, 'css/issues.css']
    );

    protected $toolId   = 'issues';
    protected $toolInit = 'AoIssues.init';
    protected $config   = [];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        $param = (string)$pageParam;
        if ($param == 'data')
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, no-store');
            exit(Util::toJSON(TemucraftIssues::all()));
        }

        if (in_array($param, ['post', 'answer', 'delete']))
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, no-store');
            if ($_SERVER['REQUEST_METHOD'] != 'POST')
                exit(Util::toJSON(['error' => 'POST only']));
            if (!TemucraftIssues::checkToken($_POST['t'] ?? null))
                exit(Util::toJSON(['error' => 'Your session ran out. Reload the page and try again.']));

            $id = (int)($_POST['id'] ?? 0);
            switch ($param)
            {
                case 'post':
                    $r = TemucraftIssues::post((string)($_POST['title'] ?? ''), (int)($_POST['kind'] ?? 0), (string)($_POST['text'] ?? ''));
                    exit(Util::toJSON(is_int($r) ? ['error' => '', 'id' => $r] : ['error' => $r]));
                case 'answer':
                    $status = isset($_POST['status']) && $_POST['status'] !== '' ? (int)$_POST['status'] : null;
                    exit(Util::toJSON(['error' => TemucraftIssues::answer($id, (string)($_POST['text'] ?? ''), $status)]));
                case 'delete':
                    exit(Util::toJSON(['error' => TemucraftIssues::delete($id)]));
            }
        }

        $this->name   = Lang::main('issues');
        $this->config = array(
            'host'     => Cfg::get('HOST_URL'),
            'token'    => $_SESSION['dataKey'] ?? '',
            'loggedIn' => (bool)User::$id,
            'canPost'  => TemucraftIssues::canPost(),
            'staff'    => TemucraftIssues::isStaff(),
            'kinds'    => TemucraftIssues::KINDS,
            'statuses' => TemucraftIssues::STATUSES,
            'limits'   => ['titleMin' => TemucraftIssues::TITLE_MIN, 'titleMax' => TemucraftIssues::TITLE_MAX, 'textMin' => TemucraftIssues::TEXT_MIN, 'textMax' => TemucraftIssues::TEXT_MAX],
            'issues'   => TemucraftIssues::all()
        );
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
