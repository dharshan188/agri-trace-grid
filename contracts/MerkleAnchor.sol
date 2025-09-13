// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MerkleAnchor
 * @dev Simple contract to anchor Merkle tree roots on blockchain
 */
contract MerkleAnchor {
    struct Anchor {
        bytes32 root;
        uint256 timestamp;
        address submitter;
    }

    mapping(bytes32 => Anchor) public anchors;
    bytes32[] public anchorHistory;
    
    event RootAnchored(
        bytes32 indexed root,
        uint256 indexed timestamp,
        address indexed submitter
    );

    /**
     * @dev Anchor a Merkle root to the blockchain
     * @param root The Merkle root hash to anchor
     */
    function anchor(bytes32 root) external {
        require(root != bytes32(0), "Invalid root hash");
        
        uint256 timestamp = block.timestamp;
        
        anchors[root] = Anchor({
            root: root,
            timestamp: timestamp,
            submitter: msg.sender
        });
        
        anchorHistory.push(root);
        
        emit RootAnchored(root, timestamp, msg.sender);
    }

    /**
     * @dev Verify if a root has been anchored
     * @param root The Merkle root to verify
     * @return exists Whether the root exists
     * @return timestamp When it was anchored
     * @return submitter Who anchored it
     */
    function verifyAnchor(bytes32 root) 
        external 
        view 
        returns (bool exists, uint256 timestamp, address submitter) 
    {
        Anchor memory anchor = anchors[root];
        exists = anchor.timestamp > 0;
        timestamp = anchor.timestamp;
        submitter = anchor.submitter;
    }

    /**
     * @dev Get the latest anchored root
     */
    function getLatestRoot() external view returns (bytes32) {
        if (anchorHistory.length == 0) {
            return bytes32(0);
        }
        return anchorHistory[anchorHistory.length - 1];
    }

    /**
     * @dev Get total number of anchored roots
     */
    function getAnchorCount() external view returns (uint256) {
        return anchorHistory.length;
    }
}