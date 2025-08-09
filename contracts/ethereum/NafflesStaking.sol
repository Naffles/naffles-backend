// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title NafflesStaking
 * @dev Secure NFT staking contract with multi-signature admin controls and collection-specific rewards
 */
contract NafflesStaking is IERC721Receiver, ReentrancyGuard, Pausable, AccessControl {
    using SafeMath for uint256;

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant MULTI_SIG_ROLE = keccak256("MULTI_SIG_ROLE");

    // Staking duration constants (in seconds)
    uint256 public constant SIX_MONTHS = 180 days;
    uint256 public constant TWELVE_MONTHS = 365 days;
    uint256 public constant THREE_YEARS = 1095 days;

    // Emergency controls
    uint256 public constant EMERGENCY_DELAY = 24 hours;
    uint256 public constant AUTO_UNPAUSE_DELAY = 7 days;
    uint256 public pausedAt;

    // Multi-signature requirements
    uint256 public multiSigThreshold = 2;
    mapping(bytes32 => uint256) public multiSigConfirmations;
    mapping(bytes32 => mapping(address => bool)) public multiSigConfirmed;

    // Staking data structures
    struct StakingPosition {
        address owner;
        address nftContract;
        uint256 tokenId;
        uint256 stakedAt;
        uint256 unlockAt;
        uint8 duration; // 0=6months, 1=12months, 2=3years
        bool active;
    }

    struct CollectionRewards {
        uint256 sixMonthTickets;
        uint256 twelveMonthTickets;
        uint256 threeYearTickets;
        uint256 sixMonthMultiplier; // Basis points (10000 = 1.0x)
        uint256 twelveMonthMultiplier;
        uint256 threeYearMultiplier;
        bool isActive;
        bool isValidated;
    }

    struct EmergencyRequest {
        address requester;
        uint256 requestedAt;
        string reason;
        bool executed;
    }

    // State variables
    mapping(bytes32 => StakingPosition) public stakingPositions;
    mapping(address => CollectionRewards) public collectionRewards;
    mapping(address => bool) public approvedCollections;
    mapping(bytes32 => EmergencyRequest) public emergencyRequests;
    
    // User staking tracking
    mapping(address => bytes32[]) public userStakingPositions;
    mapping(address => uint256) public userStakeCount;

    // Statistics
    uint256 public totalStaked;
    uint256 public totalCollections;
    mapping(address => uint256) public collectionStakeCount;

    // Events
    event NFTStaked(
        address indexed user,
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 duration,
        uint256 unlockAt,
        bytes32 positionId
    );

    event NFTClaimed(
        address indexed user,
        address indexed nftContract,
        uint256 indexed tokenId,
        bytes32 positionId
    );

    event EmergencyUnlock(
        address indexed admin,
        address indexed user,
        address indexed nftContract,
        uint256 tokenId,
        string reason,
        bytes32 positionId
    );

    event CollectionAdded(
        address indexed nftContract,
        uint256 sixMonthTickets,
        uint256 twelveMonthTickets,
        uint256 threeYearTickets
    );

    event CollectionUpdated(
        address indexed nftContract,
        uint256 sixMonthTickets,
        uint256 twelveMonthTickets,
        uint256 threeYearTickets
    );

    event SecurityViolation(
        string violationType,
        address indexed violator,
        string details
    );

    event AdminAction(
        address indexed admin,
        string action,
        bytes data
    );

    event EmergencyAction(
        address indexed admin,
        string action,
        string reason
    );

    event MultiSigOperation(
        bytes32 indexed operationId,
        address indexed signer,
        uint256 confirmations,
        bool executed
    );

    // Modifiers
    modifier onlyMultiSig(bytes32 operationId) {
        require(hasRole(MULTI_SIG_ROLE, msg.sender), "Unauthorized: Multi-sig role required");
        
        if (!multiSigConfirmed[operationId][msg.sender]) {
            multiSigConfirmed[operationId][msg.sender] = true;
            multiSigConfirmations[operationId] = multiSigConfirmations[operationId].add(1);
            
            emit MultiSigOperation(operationId, msg.sender, multiSigConfirmations[operationId], false);
        }
        
        require(multiSigConfirmations[operationId] >= multiSigThreshold, "Insufficient multi-sig confirmations");
        _;
        
        emit MultiSigOperation(operationId, msg.sender, multiSigConfirmations[operationId], true);
    }

    modifier validNFTContract(address nftContract) {
        require(nftContract != address(0), "Invalid NFT contract address");
        require(approvedCollections[nftContract], "NFT contract not approved");
        _;
    }

    modifier validDuration(uint8 duration) {
        require(duration <= 2, "Invalid staking duration");
        _;
    }

    modifier whenNotPausedOrAutoUnpause() {
        require(!paused() || block.timestamp > pausedAt.add(AUTO_UNPAUSE_DELAY), "Contract is paused");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        _grantRole(MULTI_SIG_ROLE, msg.sender);
    }

    /**
     * @dev Stake an NFT for a specified duration
     * @param nftContract Address of the NFT contract
     * @param tokenId Token ID to stake
     * @param duration Staking duration (0=6months, 1=12months, 2=3years)
     */
    function stakeNFT(
        address nftContract,
        uint256 tokenId,
        uint8 duration
    ) external nonReentrant whenNotPausedOrAutoUnpause validNFTContract(nftContract) validDuration(duration) {
        // Verify NFT ownership
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not NFT owner");
        
        // Generate position ID
        bytes32 positionId = keccak256(abi.encodePacked(nftContract, tokenId, msg.sender, block.timestamp));
        
        // Ensure position doesn't already exist
        require(!stakingPositions[positionId].active, "Position already exists");
        
        // Calculate unlock time
        uint256 stakingDuration;
        if (duration == 0) stakingDuration = SIX_MONTHS;
        else if (duration == 1) stakingDuration = TWELVE_MONTHS;
        else stakingDuration = THREE_YEARS;
        
        uint256 unlockAt = block.timestamp.add(stakingDuration);
        
        // Transfer NFT to contract
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
        
        // Create staking position
        stakingPositions[positionId] = StakingPosition({
            owner: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            stakedAt: block.timestamp,
            unlockAt: unlockAt,
            duration: duration,
            active: true
        });
        
        // Update user tracking
        userStakingPositions[msg.sender].push(positionId);
        userStakeCount[msg.sender] = userStakeCount[msg.sender].add(1);
        
        // Update statistics
        totalStaked = totalStaked.add(1);
        collectionStakeCount[nftContract] = collectionStakeCount[nftContract].add(1);
        
        emit NFTStaked(msg.sender, nftContract, tokenId, duration, unlockAt, positionId);
        emit AdminAction(msg.sender, "stakeNFT", abi.encode(nftContract, tokenId, duration));
    }

    /**
     * @dev Claim a staked NFT after the lock period
     * @param positionId The staking position ID
     */
    function claimNFT(bytes32 positionId) external nonReentrant whenNotPausedOrAutoUnpause {
        StakingPosition storage position = stakingPositions[positionId];
        
        require(position.active, "Position not active");
        require(position.owner == msg.sender, "Not position owner");
        require(block.timestamp >= position.unlockAt, "Staking period not completed");
        
        // Mark position as inactive
        position.active = false;
        
        // Update user tracking
        userStakeCount[msg.sender] = userStakeCount[msg.sender].sub(1);
        
        // Update statistics
        totalStaked = totalStaked.sub(1);
        collectionStakeCount[position.nftContract] = collectionStakeCount[position.nftContract].sub(1);
        
        // Transfer NFT back to owner
        IERC721(position.nftContract).safeTransferFrom(address(this), msg.sender, position.tokenId);
        
        emit NFTClaimed(msg.sender, position.nftContract, position.tokenId, positionId);
        emit AdminAction(msg.sender, "claimNFT", abi.encode(positionId));
    }

    /**
     * @dev Emergency unlock of an NFT by admin (requires multi-sig)
     * @param positionId The staking position ID
     * @param reason Reason for emergency unlock
     */
    function adminUnlock(
        bytes32 positionId,
        string memory reason
    ) external onlyMultiSig(keccak256(abi.encodePacked("adminUnlock", positionId, reason))) {
        require(bytes(reason).length > 0, "Reason required for emergency unlock");
        
        StakingPosition storage position = stakingPositions[positionId];
        require(position.active, "Position not active");
        
        // Check emergency delay
        bytes32 emergencyId = keccak256(abi.encodePacked(positionId, reason));
        EmergencyRequest storage request = emergencyRequests[emergencyId];
        
        if (request.requestedAt == 0) {
            // First request - start emergency delay
            request.requester = msg.sender;
            request.requestedAt = block.timestamp;
            request.reason = reason;
            request.executed = false;
            
            emit EmergencyAction(msg.sender, "emergencyUnlockRequested", reason);
            return;
        }
        
        require(block.timestamp >= request.requestedAt.add(EMERGENCY_DELAY), "Emergency delay not met");
        require(!request.executed, "Emergency request already executed");
        
        // Mark request as executed
        request.executed = true;
        
        // Mark position as inactive
        position.active = false;
        
        // Update statistics
        totalStaked = totalStaked.sub(1);
        collectionStakeCount[position.nftContract] = collectionStakeCount[position.nftContract].sub(1);
        userStakeCount[position.owner] = userStakeCount[position.owner].sub(1);
        
        // Transfer NFT back to owner
        IERC721(position.nftContract).safeTransferFrom(address(this), position.owner, position.tokenId);
        
        emit EmergencyUnlock(msg.sender, position.owner, position.nftContract, position.tokenId, reason, positionId);
        emit AdminAction(msg.sender, "adminUnlock", abi.encode(positionId, reason));
    }

    /**
     * @dev Emergency withdrawal of NFT to specified recipient (requires multi-sig)
     * @param positionId The staking position ID
     * @param recipient Address to receive the NFT
     * @param reason Reason for emergency withdrawal
     */
    function emergencyWithdrawNFT(
        bytes32 positionId,
        address recipient,
        string memory reason
    ) external onlyMultiSig(keccak256(abi.encodePacked("emergencyWithdraw", positionId, recipient, reason))) {
        require(recipient != address(0), "Invalid recipient address");
        require(bytes(reason).length > 0, "Reason required for emergency withdrawal");
        
        StakingPosition storage position = stakingPositions[positionId];
        require(position.active, "Position not active");
        
        // Check emergency delay
        bytes32 emergencyId = keccak256(abi.encodePacked("withdraw", positionId, recipient, reason));
        EmergencyRequest storage request = emergencyRequests[emergencyId];
        
        if (request.requestedAt == 0) {
            // First request - start emergency delay
            request.requester = msg.sender;
            request.requestedAt = block.timestamp;
            request.reason = reason;
            request.executed = false;
            
            emit EmergencyAction(msg.sender, "emergencyWithdrawRequested", reason);
            return;
        }
        
        require(block.timestamp >= request.requestedAt.add(EMERGENCY_DELAY), "Emergency delay not met");
        require(!request.executed, "Emergency request already executed");
        
        // Mark request as executed
        request.executed = true;
        
        // Mark position as inactive
        position.active = false;
        
        // Update statistics
        totalStaked = totalStaked.sub(1);
        collectionStakeCount[position.nftContract] = collectionStakeCount[position.nftContract].sub(1);
        userStakeCount[position.owner] = userStakeCount[position.owner].sub(1);
        
        // Transfer NFT to recipient
        IERC721(position.nftContract).safeTransferFrom(address(this), recipient, position.tokenId);
        
        emit EmergencyAction(msg.sender, "emergencyWithdrawNFT", reason);
        emit AdminAction(msg.sender, "emergencyWithdrawNFT", abi.encode(positionId, recipient, reason));
    }

    /**
     * @dev Add a new NFT collection for staking
     * @param nftContract Address of the NFT contract
     * @param sixMonthTickets Tickets per month for 6-month staking
     * @param twelveMonthTickets Tickets per month for 12-month staking
     * @param threeYearTickets Tickets per month for 3-year staking
     */
    function addCollection(
        address nftContract,
        uint256 sixMonthTickets,
        uint256 twelveMonthTickets,
        uint256 threeYearTickets
    ) external onlyRole(ADMIN_ROLE) {
        require(nftContract != address(0), "Invalid NFT contract address");
        require(!approvedCollections[nftContract], "Collection already exists");
        
        approvedCollections[nftContract] = true;
        collectionRewards[nftContract] = CollectionRewards({
            sixMonthTickets: sixMonthTickets,
            twelveMonthTickets: twelveMonthTickets,
            threeYearTickets: threeYearTickets,
            sixMonthMultiplier: 11000, // 1.1x
            twelveMonthMultiplier: 12500, // 1.25x
            threeYearMultiplier: 15000, // 1.5x
            isActive: true,
            isValidated: false
        });
        
        totalCollections = totalCollections.add(1);
        
        emit CollectionAdded(nftContract, sixMonthTickets, twelveMonthTickets, threeYearTickets);
        emit AdminAction(msg.sender, "addCollection", abi.encode(nftContract, sixMonthTickets, twelveMonthTickets, threeYearTickets));
    }

    /**
     * @dev Update collection reward structure
     * @param nftContract Address of the NFT contract
     * @param sixMonthTickets Tickets per month for 6-month staking
     * @param twelveMonthTickets Tickets per month for 12-month staking
     * @param threeYearTickets Tickets per month for 3-year staking
     */
    function updateCollectionRewards(
        address nftContract,
        uint256 sixMonthTickets,
        uint256 twelveMonthTickets,
        uint256 threeYearTickets
    ) external onlyRole(ADMIN_ROLE) {
        require(approvedCollections[nftContract], "Collection not approved");
        
        CollectionRewards storage rewards = collectionRewards[nftContract];
        rewards.sixMonthTickets = sixMonthTickets;
        rewards.twelveMonthTickets = twelveMonthTickets;
        rewards.threeYearTickets = threeYearTickets;
        
        emit CollectionUpdated(nftContract, sixMonthTickets, twelveMonthTickets, threeYearTickets);
        emit AdminAction(msg.sender, "updateCollectionRewards", abi.encode(nftContract, sixMonthTickets, twelveMonthTickets, threeYearTickets));
    }

    /**
     * @dev Validate a collection (admin function)
     * @param nftContract Address of the NFT contract
     * @param validated Whether the collection is validated
     */
    function validateCollection(address nftContract, bool validated) external onlyRole(ADMIN_ROLE) {
        require(approvedCollections[nftContract], "Collection not approved");
        
        collectionRewards[nftContract].isValidated = validated;
        
        emit AdminAction(msg.sender, "validateCollection", abi.encode(nftContract, validated));
    }

    /**
     * @dev Pause the contract (emergency function)
     */
    function pauseContract() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        pausedAt = block.timestamp;
        
        emit EmergencyAction(msg.sender, "pauseContract", "Emergency pause activated");
        emit AdminAction(msg.sender, "pauseContract", "");
    }

    /**
     * @dev Unpause the contract
     */
    function unpauseContract() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
        pausedAt = 0;
        
        emit EmergencyAction(msg.sender, "unpauseContract", "Contract unpaused");
        emit AdminAction(msg.sender, "unpauseContract", "");
    }

    /**
     * @dev Update multi-signature threshold
     * @param newThreshold New threshold for multi-sig operations
     */
    function updateMultiSigThreshold(uint256 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newThreshold > 0, "Threshold must be greater than 0");
        require(newThreshold <= getRoleMemberCount(MULTI_SIG_ROLE), "Threshold exceeds member count");
        
        multiSigThreshold = newThreshold;
        
        emit AdminAction(msg.sender, "updateMultiSigThreshold", abi.encode(newThreshold));
    }

    // View functions
    
    /**
     * @dev Get staking position details
     * @param positionId The staking position ID
     */
    function getStakingPosition(bytes32 positionId) external view returns (StakingPosition memory) {
        return stakingPositions[positionId];
    }

    /**
     * @dev Get collection reward structure
     * @param nftContract Address of the NFT contract
     */
    function getCollectionRewards(address nftContract) external view returns (CollectionRewards memory) {
        return collectionRewards[nftContract];
    }

    /**
     * @dev Get user's staking positions
     * @param user Address of the user
     */
    function getUserStakingPositions(address user) external view returns (bytes32[] memory) {
        return userStakingPositions[user];
    }

    /**
     * @dev Check if NFT is currently staked
     * @param nftContract Address of the NFT contract
     * @param tokenId Token ID to check
     */
    function isNFTStaked(address nftContract, uint256 tokenId) external view returns (bool, bytes32) {
        // This is a simplified check - in practice, you'd need to iterate through positions
        // or maintain a separate mapping for efficiency
        bytes32 positionId = keccak256(abi.encodePacked(nftContract, tokenId));
        return (stakingPositions[positionId].active, positionId);
    }

    /**
     * @dev Get contract statistics
     */
    function getContractStats() external view returns (
        uint256 _totalStaked,
        uint256 _totalCollections,
        uint256 _multiSigThreshold,
        bool _isPaused
    ) {
        return (totalStaked, totalCollections, multiSigThreshold, paused());
    }

    /**
     * @dev Required by IERC721Receiver
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @dev Emergency function to recover accidentally sent tokens
     */
    function recoverERC721(
        address nftContract,
        uint256 tokenId,
        address recipient
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Only allow recovery of NFTs not in active staking positions
        bytes32 positionId = keccak256(abi.encodePacked(nftContract, tokenId));
        require(!stakingPositions[positionId].active, "NFT is actively staked");
        
        IERC721(nftContract).safeTransferFrom(address(this), recipient, tokenId);
        
        emit AdminAction(msg.sender, "recoverERC721", abi.encode(nftContract, tokenId, recipient));
    }
}