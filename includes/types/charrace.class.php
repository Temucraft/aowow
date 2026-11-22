<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


class CharRaceList extends BaseType
{
    public static   $type      = Type::CHR_RACE;
    public static   $brickFile = 'race';
    public static   $dataTable = '?_races';

    protected       $queryBase = 'SELECT r.*, id AS ARRAY_KEY FROM ?_races r';

    // Temucraft: the expansion a race comes from (for its badge). The game data gives the custom races Classic or
    // WotLK (they have to be creatable in a 3.3.5 client), so the badge would be wrong: 3 Cata, 4 MoP, 6 Legion, 7 BfA.
    public static   $expansionOf = [9 => 3, 12 => 3, 13 => 4, 14 => 4, 15 => 6, 16 => 6, 17 => 6, 18 => 6, 19 => 7, 20 => 7];

    public static function expansion(int $race, int $fromData) : int
    {
        return self::$expansionOf[$race] ?? $fromData;
    }

    public function getListviewData()
    {
        $data = [];

        foreach ($this->iterate() as $__)
        {
            $data[$this->id] = array(
                'id'      => $this->id,
                'name'    => $this->getField('name', true),
                'classes' => $this->curTpl['classMask'],
                'faction' => $this->curTpl['factionId'],
                'leader'  => $this->curTpl['leader'],
                'zone'    => $this->curTpl['startAreaId'],
                'side'    => $this->curTpl['side']
            );

            if ($exp = self::expansion($this->id, (int)$this->curTpl['expansion']))
                $data[$this->id]['expansion'] = $exp;
        }

        return $data;
    }

    public function getJSGlobals($addMask = 0)
    {
        $data = [];

        foreach ($this->iterate() as $__)
            $data[Type::CHR_RACE][$this->id] = ['name' => $this->getField('name', true)];

        return $data;
    }

    public function renderTooltip() { }
}

?>
