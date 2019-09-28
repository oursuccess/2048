function Tile(position, value){
    this.x = positon.x;
    this.y = position.y;
    this.value = value || 2;

    this.previousPostion = null;
    this.mergedFrom = null;
}

Tile.prototype.savePostion = function(){
    this.previousPostion = {x: this.x, y: this.y};
};

Tile.prototype.updatePostion = function(position){
    this.x = position.x;
    this.y = position.y;
};

Tile.prototype.serialize = function(){
    return{
        position:{
            x: this.x,
            y: this.y
        },
        value: this.value
    };
};