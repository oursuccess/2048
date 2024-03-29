function Tile(position, value, moveable = true, Powerup = false, canMerge = true) {
    this.x = position.x;
    this.y = position.y;
    this.value = value || 2;

    this.previousPosition = null;
    this.mergedFrom = null;
    
    this.moveable = moveable;
    this.isPowerup = Powerup;
    this.canMerge = canMerge;
}

Tile.prototype.savePosition = function () {
    this.previousPosition = { x: this.x, y: this.y };
};

Tile.prototype.updatePosition = function (position) {
    this.x = position.x;
    this.y = position.y;
    this.moveable = true;
    this.isPowerup = false;
};

Tile.prototype.serialize = function () {
    return {
        position: {
            x: this.x,
            y: this.y
        },
        value: this.value
    };
};
