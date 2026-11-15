// SPDX-License-Identifier: GLP-3.0
pragma solidity ^0.8.0;//solidity version

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";

/*importing from git the ERC721 Token standard and Ownable*/

contract Token is ERC721URIStorage, Ownable //inherit from ERC721 and Ownable
{
struct ZdappyBird { 
    uint256 damage;
    uint256 magic;
    uint256 lastmeal;
    uint256 endurance;
    uint256 experience;
    uint256 level;
}


mapping(uint256=>ZdappyBird) private tokenDetails;

constructor(string memory name, string memory symbol) ERC721(name, symbol){

}
uint256 tokenCounter = 0; 

//function to mint tokens
function mint(uint256 damage, uint256 magic, uint256 endurance, uint256 experience, uint256 level)public onlyOwner{ 

    uint256 newid = tokenCounter; 
    tokenDetails[newid]=ZdappyBird(damage,magic,block.timestamp,endurance,experience,level); 
    _safeMint(msg.sender,newid);//function in ERC721 for creation and mapping tokens
    tokenCounter++;

}

function getTokensOfUser(address user)public view returns(uint256[] memory){ 
    uint256 totalCount=balanceOf(user); 
    if(totalCount==0) 
    {
        return new uint256[](0); 
    } else {
    uint256[] memory result = new uint256[](totalCount); 
    uint256 totalZdappyBirds=tokenCounter;
    uint256 i; 
    uint256 resultIndex=0;
    for(i=0; i<totalZdappyBirds; i++)
    { 
        if(ownerOf(i)==user)         {    
            result[resultIndex]=i;
            resultIndex++;
        }
    }
        return result;
    }
}
    

function Damage(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].damage;
}
function Magic(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].magic;
}
function LastMeal(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].lastmeal;
}
function Endurance(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].endurance;
}
function Experience(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].experience;
}
function Level(uint256 tokenId) public view returns(uint256){
    return tokenDetails[tokenId].level;
}



function Feed(uint256 tokenId) public { 
    ZdappyBird storage zdappyBird=tokenDetails[tokenId]; 
    require(zdappyBird.lastmeal+zdappyBird.endurance>block.timestamp); 
    //updating last meal of your ZdappyBird to the current time stamp
    zdappyBird.lastmeal=block.timestamp;
}

function LevelUp(uint256 tokenId, uint256 experience) public { 
    ZdappyBird storage zdappyBird=tokenDetails[tokenId]; 
    uint256 new_exp = zdappyBird.experience+experience;
    zdappyBird.level +=  new_exp/10;
    zdappyBird.experience += new_exp%10;
}

function DamangeUp(uint256 tokenId, uint256 value) public { 
    ZdappyBird storage zdappyBird=tokenDetails[tokenId]; 
    zdappyBird.damage += value;
}

function MagicUp(uint256 tokenId, uint256 value) public { 
    ZdappyBird storage zdappyBird=tokenDetails[tokenId]; 
    zdappyBird.magic += value;
}

function EnduranceUp(uint256 tokenId, uint256 value) public { 
    ZdappyBird storage zdappyBird=tokenDetails[tokenId]; 
    zdappyBird.endurance += value;
}
}