// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Treasury - A timelock-protected vault for DAO funds
/// @notice Holds the community's ETH. Transactions must be queued and wait
///         for a mandatory delay before execution, giving the community time
///         to react to malicious proposals.
contract Treasury {
    address public governance;
    uint256 public timelockDelay;

    struct QueuedTransaction {
        address target;
        uint256 value;
        uint256 executeAfter; // Timestamp after which the tx can be executed
        bool executed;
        bool cancelled;
    }

    mapping(bytes32 => QueuedTransaction) public queuedTransactions;

    event TransactionQueued(bytes32 indexed txId, address indexed target, uint256 value, uint256 executeAfter);
    event TransactionExecuted(bytes32 indexed txId, address indexed target, uint256 value);
    event TransactionCancelled(bytes32 indexed txId);
    event FundsReceived(address indexed sender, uint256 amount);

    modifier onlyGovernance() {
        require(msg.sender == governance, "Only the Governance contract can call this");
        _;
    }

    /// @param _governance The address of the Governance contract that controls this Treasury
    /// @param _timelockDelay The minimum delay (in seconds) before a queued tx can be executed
    constructor(address _governance, uint256 _timelockDelay) {
        governance = _governance;
        timelockDelay = _timelockDelay;
    }

    /// @notice Allows the Treasury to receive ETH
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    /// @notice Queue a transaction for delayed execution. Only callable by Governance.
    /// @return txId The unique identifier for this queued transaction
    function queueTransaction(address _target, uint256 _value) external onlyGovernance returns (bytes32) {
        uint256 executeAfter = block.timestamp + timelockDelay;
        bytes32 txId = keccak256(abi.encode(_target, _value, executeAfter));

        require(queuedTransactions[txId].executeAfter == 0, "Transaction already queued");

        queuedTransactions[txId] = QueuedTransaction({
            target: _target,
            value: _value,
            executeAfter: executeAfter,
            executed: false,
            cancelled: false
        });

        emit TransactionQueued(txId, _target, _value, executeAfter);
        return txId;
    }

    /// @notice Execute a queued transaction after the timelock delay has passed.
    ///         Anyone can call this to finalize a passed proposal.
    function executeTransaction(bytes32 _txId) external {
        QueuedTransaction storage txn = queuedTransactions[_txId];

        require(txn.executeAfter != 0, "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");
        require(!txn.cancelled, "Transaction was cancelled");
        require(block.timestamp >= txn.executeAfter, "Timelock delay has not passed");
        require(address(this).balance >= txn.value, "Insufficient treasury balance");

        txn.executed = true;

        (bool success, ) = txn.target.call{value: txn.value}("");
        require(success, "ETH transfer failed");

        emit TransactionExecuted(_txId, txn.target, txn.value);
    }

    /// @notice Cancel a queued transaction. Only callable by Governance (e.g., via a cancel proposal).
    function cancelTransaction(bytes32 _txId) external onlyGovernance {
        QueuedTransaction storage txn = queuedTransactions[_txId];
        require(txn.executeAfter != 0, "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");

        txn.cancelled = true;
        emit TransactionCancelled(_txId);
    }

    /// @notice Get the current balance of the Treasury
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
