function GameManager(size, InputManager, Actuator, StorageManager) {
    this.size = size;
    this.inputManager = new InputManager;
    this.storageManager = new StorageManager;
    this.actuator = new Actuator;

    this.startTiles = 2;
    
    this.inputManager.on("move", this.move.bind(this));
    this.inputManager.on("restart", this.restart.bind(this));
    this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

    this.values = [7,9];

    this.setup();
}

GameManager.prototype.restart = function () {
    this.storageManager.clearGameState();
    this.actuator.continueGame();
    this.setup();
};

GameManager.prototype.keepPlaying = function () {
    this.keepPlaying = true;
    this.actuator.continueGame();
};

GameManager.prototype.isGameTerminated = function () {
    return this.over || (this.won && !this.keepPlaying);
};

GameManager.prototype.setup = function () {
    var previousState = this.storageManager.getGameState();

    if (previousState) {
        this.grid = new Grid(previousState.grid.size, previousState.grid.cells);
        this.score = previousState.score;
        this.over = previousState.over;
        this.won = previousState.won;
        this.keepPlaying = previousState.keepPlaying;

        this.targetScore = this.storageManager.getBestScore() < 1024 ? 1024 : Math.pow(2, Math.ceil(Math.log2(this.storageManager.getBestScore())))/2;
    }
    else {
        this.grid = new Grid(this.size);
        this.score = 0;
        this.over = false;
        this.won = false;
        this.keepPlaying = false;
        
        this.targetScore = this.storageManager.getBestScore() < 1024 ? 1024 : Math.pow(2, Math.ceil(Math.log2(this.storageManager.getBestScore())))/2;

        this.addStartTiles();
    }
    
    //this.actuator.updateTargetScore(this.targetScore);

    this.actuate();
};

GameManager.prototype.addStartTiles = function () {
    //在开局添加随机的不可合并的方块
    if (Math.random() < 0.5) {
        this.addStaticTile(false);
    }
    else if (Math.random() < 0.5) {
        this.addStaticTile(true);
    }
    for (var i = 0; i < this.startTiles; i++) {
        this.addRandomTile();
    }
};

GameManager.prototype.addRandomTile = function () {
    if (this.grid.cellsAvailable()) {
        if(Math.random() < 0.15){
            this.addPowerupTile();
        }
        else {
            var value = Math.random() < 0.7 ? 2 : 4; 
            if (this.won && Math.random() + this.score / (this.storageManager.getBestScore() * 2 + 49600)> 0.95) {
                
                value = 2 * Math.floor(Math.random() * 1024 % 512) + 1;
                //var values = [7, 9, 77, 777, 233, 999];

                if (this.values.includes(value)) {
                    value += 4;
                }
                var tile = new Tile(this.grid.randomAvailableCell(), value, true, false, false);
                this.grid.insertTile(tile);
            }
            else{
                var tile = new Tile(this.grid.randomAvailableCell(), value);
                this.grid.insertTile(tile);
            }
        }
    }
};

GameManager.prototype.addStaticTile = function (moveable) {
    if (this.grid.cellsAvailable()) {
        var value = moveable ? 3 : 1;
        var tile = new Tile(this.grid.randomAvailableCell(), value, moveable);

        this.grid.insertTile(tile);
    }
};

GameManager.prototype.addPowerupTile = function () {
    //添加可以具有随机效果的奖励方块，在玩家移动后触发相应效果
    //999: 将3*3范围内的方格消除，并生成这些方格之和（向上取2的幂次整数，下同）
    //666: 变为一个不超过当前最大有效数字2倍的数 
    //233: 随机消除某一数字的所有方块，返回这些方格之和
    //777: 消除本数字的整行整列，在原地生成这些方格的和
    //77: 消除本数字的整行或整列（玩家选择），在原地生成对应的和或7系列的其它数字
    //9: 可与任意数字合并，合并后转变为2的对应幂次
    //7: 消除指定方向上的1格数字
    
    if (this.grid.cellsAvailable) {
        //var values = [7, 9, 77, 777, 233, 666, 999];
        var value = this.values[Math.floor(Math.random() * this.values.length)];
        var isPowerup = true;
        var canMerge = false;
        var tile = new Tile(this.grid.randomAvailableCell(), value, true, isPowerup, canMerge);
        this.grid.insertTile(tile);
    }
};

GameManager.prototype.actuate = function () {
    if (this.storageManager.getBestScore() < this.score) {
        this.storageManager.setBestScore(this.score);
        if (!this.over && Math.random() < 0.4) {
            this.addPowerupTile();
        }
    }

    if (this.over) {
        this.storageManager.clearGameState();
    }
    else {
        this.storageManager.setGameState(this.serialize());
    }

    this.actuator.actuate(this.grid, {
        score: this.score,
        over: this.over,
        won: this.won,
        bestScore: this.storageManager.getBestScore(),
        terminated: this.isGameTerminated(),
        targetScore: this.targetScore
    });
};

GameManager.prototype.serialize = function () {
    return {
        grid: this.grid.serialize(),
        score: this.score,
        over: this.over,
        won: this.won,
        keepPlaying: this.keepPlaying
    };
};

GameManager.prototype.prepareTiles = function () {
    this.grid.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.savePosition();
        }
    });
};

GameManager.prototype.moveTile = function (tile, cell) {
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
};

GameManager.prototype.move = function (direction) {
    var self = this;
    if (this.isGameTerminated()) return;

    var cell, tile;
    var vector = this.getVector(direction);
    var traversals = this.buildTraversals(vector);
    var moved = false;
    var powerHandled = false;
    var powerupUped = false;

    this.prepareTiles();

    traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) {
            cell = { x: x, y: y };
            tile = self.grid.cellContent(cell);

            if (tile && tile.moveable) {
                var positions = self.findFarthestPosition(cell, vector);
                var next = self.grid.cellContent(positions.next);

                //检验是否为奖励块
                if (tile.isPowerup) {
                    if (tile.value === 7) {
                        var cell = {x: tile.x, y: tile.y};
                        var previous;
                        var i = 0;
                        do {
                            previous = cell;
                            cell = {x: previous.x + vector.x, y: previous.y + vector.y};
                            if (self.grid.cellOccupied(cell)) {
                                self.grid.removeTile(cell);
                                i++;
                                tile.isPowerup = false;
                            }
                        } while (i < 1 && self.grid.withinBounds(cell));
                        self.grid.removeTile(tile);
                    }
                    else if (tile.value === 9) {
                        if (next && !next.isPowerup && next.canMerge && !next.mergedFrom) {
                            tile.value = next.value;
                            var merged = new Tile(positions.next, tile.value * 2);
                            merged.mergedFrom = [tile, next];

                            self.grid.insertTile(merged);
                            self.grid.removeTile(tile);
                            tile.updatePosition(positions.next);
                            }
                    }
                    else if (tile.value === 77) {
                        if (vector.x !== 0) {
                            self.mergeCol(tile);
                        } else {
                            self.mergeRow(tile);
                        }
                    }
                    else if (tile.value === 777) {
                        self.mergeColRow(tile);
                    }
                    else if (tile.value === 233) {
                        self.mergeANum(tile);
                    }
                    else if (tile.value === 666) {
                        self.selfChange(tile);
                    }
                    else if (tile.value === 999) {
                        self.boom3x3(tile);
                    }
                    else {
                        tile.isPowerup = false;
                        self.grid.removeTile(tile);
                        tile.updatePosition(tile.farthest);
                    }
                    powerHandled = true;
                }
                else if (tile.canMerge && next && next.value === tile.value && !next.mergedFrom) {
                    var merged = new Tile(positions.next, tile.value * 2 );
                    merged.mergedFrom = [tile, next];

                    self.grid.insertTile(merged);
                    self.grid.removeTile(tile);

                    tile.updatePosition(positions.next);

                    self.score += merged.value;

                    //if (merged.value >= 2048) self.won = true;
                }
                else {
                    self.moveTile(tile, positions.farthest);
                }

                if (!tile || !self.positionsEqual(cell, tile) || powerHandled) {
                    moved = true;
                }
            }
        });
    });

    if (moved) { 
        if(this.maxValue() >= this.targetScore){
            this.won = true;

        }

        if (this.won) {
            this.randomDivideCell();
            this.targetScore = this.storageManager.getBestScore() < 1024 ? 1024 : Math.pow(2, Math.ceil(Math.log2(this.storageManager.getBestScore()))) / 2;
            if(!powerupUped){
                this.values.push(77,777, 233, 666, 999);
                powerupUped = true;
            }
        }
        this.addRandomTile();

        if (!this.movesAvailable()) {
            this.over = true;
        }

        this.actuate();
    }
};

GameManager.prototype.getVector = function(direction){
    var map = {
        0: { x: 0, y: -1 },
        1: { x: 1, y: 0 },
        2: { x: 0, y: 1 },
        3: { x: -1, y: 0 }
    };

    return map[direction];
};

GameManager.prototype.buildTraversals = function (vector) {
    var traversals = { x: [], y: [] };

    for (var pos = 0; pos < this.size; pos++) {
        traversals.x.push(pos);
        traversals.y.push(pos);
    }

    if (vector.x === 1) traversals.x = traversals.x.reverse();
    if (vector.y === 1) traversals.y = traversals.y.reverse();

    return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
    var previous;

    do {
        previous = cell;
        cell = { x: previous.x + vector.x, y: previous.y + vector.y };
    } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

    return {
        farthest: previous,
        next: cell
    };
};

GameManager.prototype.movesAvailable = function () {
    return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

GameManager.prototype.tileMatchesAvailable = function () {
    var self = this;
    var tile;

    for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) {
            tile = this.grid.cellContent({ x: x, y: y });

            if (tile && tile.value % 2 === 0 && tile.value !== 666) {
                for (var direction = 0; direction < 4; direction++) {
                    var vector = self.getVector(direction);
                    var cell = { x: x + vector.x, y: y + vector.y };

                    var other = self.grid.cellContent(cell);

                    if (other && other.value === tile.value) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
    return first.x === second.x && first.y === second.y;
};

GameManager.prototype.mergeCol = function (tile) {
    var value = 0;
    var position = {x: tile.x, y: tile.y};

    for (var x = 0; x < this.size; x++) {
        var cell = { x: x, y: tile.y };
        if (this.grid.cellOccupied(cell)) {
            if(!this.grid.cellContent(cell).isPowerup && this.grid.cellContent(cell).canMerge){
                value += this.grid.cellContent(cell).value;
            }
            this.grid.removeTile(cell);
        }
    }

    value = Math.pow(2, Math.ceil(Math.log2(value)));
    value /= 1 + Math.round(Math.random());

    var powered = new Tile(position, value);
    this.grid.insertTile(powered);
    tile.updatePosition(position);
};


GameManager.prototype.mergeRow = function (tile) {
    var value = 0;
    var position = {x: tile.x, y: tile.y};

    for (var y = 0; y < this.size; y++) {
        var cell = { x: tile.x, y: y };
        if (this.grid.cellOccupied(cell)) {
            if(!this.grid.cellContent(cell).isPowerup && this.grid.cellContent(cell).canMerge) {
                value += this.grid.cellContent(cell).value;
            }
            this.grid.removeTile(cell);
        }
    }

    value = Math.pow(2, Math.ceil(Math.log2(value)));
    value /= 1 + Math.round(Math.random());

    var powered = new Tile(position, value);
    this.grid.insertTile(powered);
    tile.updatePosition(position);
};

GameManager.prototype.mergeColRow = function (tile) {
    var value = 0;
    var position = {x: tile.x, y: tile.y};

    for (var y = 0; y < this.size; y++) {
        var cell = {x: position.x, y: y};
        if (this.grid.cellOccupied(cell)) {
            if(!this.grid.cellContent(cell).isPowerup && this.grid.cellContent(cell).canMerge) {
                value += this.grid.cellContent(cell).value;
            }
            this.grid.removeTile(cell);
        }
    }

    for (var x = 0; x < this.size; x++) {
        var cell = {x: x, y: position.y};

        if (this.grid.cellOccupied(cell)) {
            if(!this.grid.cellContent(cell).isPowerup && this.grid.cellContent(cell).canMerge) {
                value += this.grid.cellContent(cell).value;
            }
            this.grid.removeTile(cell);
        }
    }

    value = Math.pow(2, Math.ceil(Math.log2(value)));
    value = 1 + Math.round(Math.random());

    var powered = new Tile(position, value);
    this.grid.insertTile(powered);
    tile.updatePosition(position);
};

GameManager.prototype.mergeANum = function(tile) {
    var values = [];
    var position = {x: tile.x, y: tile.y};

    for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) {
            var cell = {x: x, y: y};
            if (this.grid.cellOccupied(cell) && !this.grid.cellContent(cell).isPowerup && this.grid.cellContent(cell).canMerge) {
                values.push(this.grid.cellContent(cell).value);
            }
        }
    }

    if (values.length) {
        var keyValue = values[Math.floor(Math.random() * values.length)];
        var value = 0;

        for (var x = 0; x < this.size; x++) {
            for (var y = 0; y < this.size; y++) {
                var cell = { x: x, y: y };
                if (this.grid.cellOccupied(cell) && this.grid.cellContent(cell).value === keyValue) {
                    value += this.grid.cellContent(cell).value;
                    this.grid.removeTile(cell);
                }
            }
        }

        this.grid.removeTile(tile);
        value = Math.pow(2, Math.ceil(Math.log2(value)));

        var powered = new Tile(position, value, value === 1 ? false : true);
        this.grid.insertTile(powered);
        tile.updatePosition(position);
    }
};

GameManager.prototype.selfChange = function (tile) {
    var position = {x: tile.x, y: tile.y};
    var value = this.maxValue();
    value = Math.pow(2, Math.floor(Math.random() * Math.log2(value * 2)));

    var powered = new Tile(position, value, value === 1 ? false : true);

    this.grid.removeTile(tile);
    this.grid.insertTile(powered);
    tile.updatePosition(position);
};

GameManager.prototype.maxValue = function () {
    var max = 0;
    this.grid.eachCell(function (x, y, tile) {
        if(tile && !tile.isPowerup && tile.canMerge && tile.value > max) {
            max = tile.value;
        }
    });
    return max;
};

GameManager.prototype.boom3x3 = function (tile) {
    var value = 0;
    var position = {x: tile.x, y: tile.y};

    var xMin = Math.max(0, tile.x - 1);
    var xMax = Math.min(this.size, tile.x + 2);
    var yMin = Math.max(0, tile.y - 1);
    var yMax = Math.min(this.size, tile.y + 2);

    for(var x = xMin; x < xMax; x++){
        for(var y = yMin; y < yMax; y++){
            var cell = {x: x, y: y};
            var cel = this.grid.cellContent(cell);
            if(cel){
                if (!cel.isPowerup && cel.canMerge) {
                    value += cel.value;
                }
                this.grid.removeTile(cel);
            }
        }
    }

    this.grid.removeTile(tile);

    value = Math.max(Math.pow(2, Math.floor(Math.log2(value))), 1);

    var powered = new Tile(position, value, value === 1 ? false : true);
    this.grid.insertTile(powered);
    tile.updatePosition(position);
};

GameManager.prototype.randomDivideCell = function () {
    var divided = false;
    while (!divided) {
        var x = Math.floor(Math.random() * 3);
        var y = Math.floor(Math.random() * 3);

        var cell = {x: x, y: y};
        divided = this.divideCell(cell);
    }
};

GameManager.prototype.divideCell = function (cell) {
    if(this.grid.cellOccupied(cell)){
        var tile = this.grid.cellContent(cell);
        if(!tile.isPowerup && !tile.value === 2 && tile.canMerge && !tile.value % 2){
            tile.value /= 2;
            return true;
        }
    }
    return false;
};