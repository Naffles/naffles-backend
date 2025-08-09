const smartContractService = require('./smartContractService');
const StakingPosition = require('../models/staking/stakingPosition');
const StakingContract = require('../models/staking/stakingContract');

class BlockchainVerificationService {
  constructor() {
    this.verificationCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.batchSize = 50;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Real-time staking status verification

  async verifyStakingStatus(blockchain, positionId, useCache = true) {
    try {
      const cacheKey = `${blockchain}:${positionId}`;
      
      // Check cache first if enabled
      if (useCache && this.verificationCache.has(cacheKey)) {
        const cached = this.verificationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      // Get position from smart contract
      const contractPosition = await this.getContractPositionWithRetry(blockchain, positionId);
      
      if (!contractPosition) {
        return {
          verified: false,
          error: 'Position not found on smart contract',
          blockchain,
          positionId
        };
      }

      // Get database position for comparison
      const dbPosition = await StakingPosition.findOne({
        smartContractPositionId: positionId,
        blockchain: blockchain.toLowerCase()
      });

      const verification = await this.comparePositions(contractPosition, dbPosition);
      
      // Cache the result
      if (useCache) {
        this.verificationCache.set(cacheKey, {
          data: verification,
          timestamp: Date.now()
        });
      }

      return verification;
    } catch (error) {
      console.error(`Error verifying staking status for ${blockchain}:${positionId}:`, error);
      return {
        verified: false,
        error: error.message,
        blockchain,
        positionId
      };
    }
  }

  async getContractPositionWithRetry(blockchain, positionId, retryCount = 0) {
    try {
      return await smartContractService.getStakingPosition(blockchain, positionId);
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.warn(`Retry ${retryCount + 1} for getting position ${blockchain}:${positionId}`);
        await this.delay(this.retryDelay * (retryCount + 1));
        return await this.getContractPositionWithRetry(blockchain, positionId, retryCount + 1);
      }
      throw error;
    }
  }

  async comparePositions(contractPosition, dbPosition) {
    const verification = {
      verified: false,
      contractData: contractPosition,
      databaseData: dbPosition ? {
        owner: dbPosition.walletAddress,
        nftContract: dbPosition.nftContractAddress,
        tokenId: dbPosition.nftTokenId,
        stakedAt: dbPosition.stakedAt,
        unlockAt: dbPosition.unstakeAt,
        duration: dbPosition.stakingDuration,
        active: dbPosition.status === 'active'
      } : null,
      discrepancies: [],
      integrityScore: 0
    };

    if (!dbPosition) {
      verification.discrepancies.push('Position exists on smart contract but not in database');
      return verification;
    }

    // Compare key fields
    const comparisons = [
      {
        field: 'owner',
        contract: contractPosition.owner?.toLowerCase(),
        database: dbPosition.walletAddress?.toLowerCase(),
        weight: 25
      },
      {
        field: 'nftContract',
        contract: contractPosition.nftContract?.toLowerCase(),
        database: dbPosition.nftContractAddress?.toLowerCase(),
        weight: 20
      },
      {
        field: 'tokenId',
        contract: contractPosition.tokenId?.toString(),
        database: dbPosition.nftTokenId?.toString(),
        weight: 20
      },
      {
        field: 'active',
        contract: contractPosition.active,
        database: dbPosition.status === 'active',
        weight: 25
      },
      {
        field: 'duration',
        contract: this.mapContractDurationToMonths(contractPosition.duration),
        database: dbPosition.stakingDuration,
        weight: 10
      }
    ];

    let totalScore = 0;
    let maxScore = 0;

    for (const comparison of comparisons) {
      maxScore += comparison.weight;
      
      if (comparison.contract === comparison.database) {
        totalScore += comparison.weight;
      } else {
        verification.discrepancies.push({
          field: comparison.field,
          contract: comparison.contract,
          database: comparison.database
        });
      }
    }

    verification.integrityScore = Math.round((totalScore / maxScore) * 100);
    verification.verified = verification.integrityScore >= 90; // 90% threshold for verification

    return verification;
  }

  mapContractDurationToMonths(contractDuration) {
    switch (contractDuration) {
      case 0: return 6;
      case 1: return 12;
      case 2: return 36;
      default: return null;
    }
  }

  // Batch verification for multiple positions

  async batchVerifyStakingPositions(positions, useCache = true) {
    const results = [];
    const batches = this.createBatches(positions, this.batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(position => 
        this.verifyStakingStatus(position.blockchain, position.positionId, useCache)
          .catch(error => ({
            verified: false,
            error: error.message,
            blockchain: position.blockchain,
            positionId: position.positionId
          }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the blockchain
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(100);
      }
    }

    return results;
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  // NFT ownership verification

  async verifyNFTOwnership(blockchain, nftContract, tokenId, expectedOwner) {
    try {
      const stakingStatus = await smartContractService.isNFTStaked(blockchain, nftContract, tokenId);
      
      if (stakingStatus.isStaked) {
        // NFT is staked, verify the staking position owner
        const position = await smartContractService.getStakingPosition(blockchain, stakingStatus.positionId);
        
        return {
          isOwned: position.owner.toLowerCase() === expectedOwner.toLowerCase(),
          isStaked: true,
          stakingPosition: position,
          blockchain,
          nftContract,
          tokenId
        };
      } else {
        // NFT is not staked, check direct ownership (would need additional contract call)
        // This is simplified - in practice you'd call the NFT contract's ownerOf function
        return {
          isOwned: false, // Placeholder - implement actual ownership check
          isStaked: false,
          stakingPosition: null,
          blockchain,
          nftContract,
          tokenId
        };
      }
    } catch (error) {
      console.error(`Error verifying NFT ownership for ${blockchain}:${nftContract}:${tokenId}:`, error);
      return {
        isOwned: false,
        isStaked: false,
        stakingPosition: null,
        error: error.message,
        blockchain,
        nftContract,
        tokenId
      };
    }
  }

  // Cross-chain verification for community benefits

  async verifyCrossChainStaking(userWallets, requiredCollections = []) {
    try {
      const verificationResults = {
        totalStaked: 0,
        activePositions: [],
        collectionBreakdown: {},
        eligibleForBenefits: false,
        verificationScore: 0,
        chains: {}
      };

      const supportedChains = ['ethereum', 'polygon', 'base', 'solana'];
      
      for (const chain of supportedChains) {
        verificationResults.chains[chain] = {
          positions: [],
          totalStaked: 0,
          verified: false
        };

        // Get user's positions from database
        const dbPositions = await StakingPosition.find({
          walletAddress: { $in: userWallets.map(w => w.toLowerCase()) },
          blockchain: chain,
          status: 'active'
        }).populate('stakingContractId');

        if (dbPositions.length === 0) {
          verificationResults.chains[chain].verified = true;
          continue;
        }

        // Verify each position against smart contract
        const verificationPromises = dbPositions.map(async (dbPosition) => {
          if (!dbPosition.smartContractPositionId) {
            return {
              verified: false,
              error: 'No smart contract position ID',
              dbPosition
            };
          }

          const verification = await this.verifyStakingStatus(
            chain, 
            dbPosition.smartContractPositionId, 
            true
          );

          return {
            ...verification,
            dbPosition
          };
        });

        const chainVerifications = await Promise.all(verificationPromises);
        
        // Process verification results
        let chainScore = 0;
        let maxChainScore = 0;

        for (const verification of chainVerifications) {
          maxChainScore += 100;
          
          if (verification.verified) {
            chainScore += verification.integrityScore || 0;
            
            const position = {
              positionId: verification.dbPosition.smartContractPositionId,
              nftContract: verification.dbPosition.nftContractAddress,
              tokenId: verification.dbPosition.nftTokenId,
              duration: verification.dbPosition.stakingDuration,
              stakedAt: verification.dbPosition.stakedAt,
              unlockAt: verification.dbPosition.unstakeAt,
              verified: true
            };

            verificationResults.activePositions.push(position);
            verificationResults.chains[chain].positions.push(position);
            verificationResults.chains[chain].totalStaked++;
            verificationResults.totalStaked++;

            // Track collection breakdown
            const contractAddress = verification.dbPosition.nftContractAddress;
            if (!verificationResults.collectionBreakdown[contractAddress]) {
              verificationResults.collectionBreakdown[contractAddress] = {
                count: 0,
                contractName: verification.dbPosition.stakingContractId?.contractName || 'Unknown',
                blockchain: chain
              };
            }
            verificationResults.collectionBreakdown[contractAddress].count++;
          }
        }

        verificationResults.chains[chain].verified = maxChainScore === 0 || (chainScore / maxChainScore) >= 0.9;
        verificationResults.chains[chain].verificationScore = maxChainScore > 0 ? Math.round((chainScore / maxChainScore) * 100) : 100;
      }

      // Calculate overall verification score
      const chainScores = Object.values(verificationResults.chains).map(c => c.verificationScore);
      verificationResults.verificationScore = chainScores.length > 0 
        ? Math.round(chainScores.reduce((sum, score) => sum + score, 0) / chainScores.length)
        : 0;

      // Check if eligible for benefits
      verificationResults.eligibleForBenefits = this.checkBenefitEligibility(
        verificationResults,
        requiredCollections
      );

      return verificationResults;
    } catch (error) {
      console.error('Error verifying cross-chain staking:', error);
      return {
        totalStaked: 0,
        activePositions: [],
        collectionBreakdown: {},
        eligibleForBenefits: false,
        verificationScore: 0,
        chains: {},
        error: error.message
      };
    }
  }

  checkBenefitEligibility(verificationResults, requiredCollections) {
    if (verificationResults.verificationScore < 90) {
      return false;
    }

    if (requiredCollections.length === 0) {
      return verificationResults.totalStaked > 0;
    }

    // Check if user has staked NFTs from required collections
    const stakedCollections = Object.keys(verificationResults.collectionBreakdown);
    return requiredCollections.some(required => 
      stakedCollections.includes(required.toLowerCase())
    );
  }

  // Gaming bonus verification

  async verifyGamingBonuses(userWallets) {
    try {
      const crossChainVerification = await this.verifyCrossChainStaking(userWallets);
      
      if (!crossChainVerification.eligibleForBenefits) {
        return {
          eligible: false,
          bonuses: {},
          totalMultiplier: 1.0,
          verificationScore: crossChainVerification.verificationScore
        };
      }

      const bonuses = {};
      let totalMultiplier = 1.0;

      // Calculate bonuses for each collection
      for (const [contractAddress, collectionData] of Object.entries(crossChainVerification.collectionBreakdown)) {
        try {
          const stakingContract = await StakingContract.findOne({
            contractAddress: contractAddress.toLowerCase(),
            blockchain: collectionData.blockchain,
            isActive: true,
            'contractValidation.isValidated': true
          });

          if (stakingContract) {
            // Calculate average duration bonus
            const positions = crossChainVerification.activePositions.filter(
              p => p.nftContract.toLowerCase() === contractAddress.toLowerCase()
            );

            let avgMultiplier = 1.0;
            if (positions.length > 0) {
              const totalMultiplier = positions.reduce((sum, pos) => {
                const rewardStructure = stakingContract.getRewardStructure(pos.duration);
                return sum + (rewardStructure.bonusMultiplier || 1.0);
              }, 0);
              avgMultiplier = totalMultiplier / positions.length;
            }

            bonuses[contractAddress] = {
              contractName: stakingContract.contractName,
              stakedCount: collectionData.count,
              averageMultiplier: avgMultiplier,
              blockchain: collectionData.blockchain
            };

            // Apply multiplier (simplified - in practice you'd have more complex logic)
            totalMultiplier += (avgMultiplier - 1.0) * 0.1; // 10% of the bonus
          }
        } catch (error) {
          console.error(`Error calculating bonus for collection ${contractAddress}:`, error);
        }
      }

      return {
        eligible: true,
        bonuses,
        totalMultiplier: Math.min(totalMultiplier, 2.0), // Cap at 2x
        verificationScore: crossChainVerification.verificationScore,
        totalStaked: crossChainVerification.totalStaked
      };
    } catch (error) {
      console.error('Error verifying gaming bonuses:', error);
      return {
        eligible: false,
        bonuses: {},
        totalMultiplier: 1.0,
        verificationScore: 0,
        error: error.message
      };
    }
  }

  // Data consistency checks

  async performDataConsistencyCheck(blockchain = null) {
    try {
      const query = { status: 'active' };
      if (blockchain) {
        query.blockchain = blockchain.toLowerCase();
      }

      const dbPositions = await StakingPosition.find(query)
        .populate('stakingContractId')
        .limit(1000); // Process in batches

      const inconsistencies = [];
      const verificationPromises = dbPositions.map(async (dbPosition) => {
        if (!dbPosition.smartContractPositionId) {
          inconsistencies.push({
            type: 'missing_contract_id',
            positionId: dbPosition._id,
            blockchain: dbPosition.blockchain,
            nftContract: dbPosition.nftContractAddress,
            tokenId: dbPosition.nftTokenId
          });
          return null;
        }

        const verification = await this.verifyStakingStatus(
          dbPosition.blockchain,
          dbPosition.smartContractPositionId,
          false // Don't use cache for consistency checks
        );

        if (!verification.verified) {
          inconsistencies.push({
            type: 'verification_failed',
            positionId: dbPosition._id,
            blockchain: dbPosition.blockchain,
            smartContractPositionId: dbPosition.smartContractPositionId,
            discrepancies: verification.discrepancies,
            integrityScore: verification.integrityScore
          });
        }

        return verification;
      });

      await Promise.all(verificationPromises);

      return {
        totalChecked: dbPositions.length,
        inconsistencies: inconsistencies.length,
        consistencyScore: Math.round(((dbPositions.length - inconsistencies.length) / dbPositions.length) * 100),
        issues: inconsistencies,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error performing data consistency check:', error);
      return {
        totalChecked: 0,
        inconsistencies: 0,
        consistencyScore: 0,
        issues: [],
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Anomaly detection

  async detectAnomalies(timeWindow = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const cutoffTime = new Date(Date.now() - timeWindow);
      
      // Get recent positions
      const recentPositions = await StakingPosition.find({
        createdAt: { $gte: cutoffTime }
      });

      const anomalies = [];

      // Check for unusual staking patterns
      const stakingFrequency = {};
      const contractFrequency = {};

      for (const position of recentPositions) {
        // Track staking frequency per wallet
        const wallet = position.walletAddress.toLowerCase();
        stakingFrequency[wallet] = (stakingFrequency[wallet] || 0) + 1;

        // Track contract frequency
        const contract = position.nftContractAddress.toLowerCase();
        contractFrequency[contract] = (contractFrequency[contract] || 0) + 1;
      }

      // Detect high-frequency staking (potential abuse)
      for (const [wallet, frequency] of Object.entries(stakingFrequency)) {
        if (frequency > 10) { // More than 10 stakes in 24 hours
          anomalies.push({
            type: 'high_frequency_staking',
            wallet,
            frequency,
            severity: frequency > 20 ? 'high' : 'medium'
          });
        }
      }

      // Detect unusual contract activity
      const avgContractActivity = Object.values(contractFrequency).reduce((sum, freq) => sum + freq, 0) / Object.keys(contractFrequency).length;
      
      for (const [contract, frequency] of Object.entries(contractFrequency)) {
        if (frequency > avgContractActivity * 3) { // 3x above average
          anomalies.push({
            type: 'unusual_contract_activity',
            contract,
            frequency,
            averageActivity: Math.round(avgContractActivity),
            severity: frequency > avgContractActivity * 5 ? 'high' : 'medium'
          });
        }
      }

      // Check for verification failures
      const verificationFailures = await this.getRecentVerificationFailures(cutoffTime);
      anomalies.push(...verificationFailures);

      return {
        timeWindow: timeWindow / (60 * 60 * 1000), // Convert to hours
        totalAnomalies: anomalies.length,
        anomalies,
        riskScore: this.calculateRiskScore(anomalies),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return {
        timeWindow: 0,
        totalAnomalies: 0,
        anomalies: [],
        riskScore: 0,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async getRecentVerificationFailures(cutoffTime) {
    // This would query a verification log table if it existed
    // For now, return empty array
    return [];
  }

  calculateRiskScore(anomalies) {
    let score = 0;
    
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'high':
          score += 10;
          break;
        case 'medium':
          score += 5;
          break;
        case 'low':
          score += 1;
          break;
      }
    }

    return Math.min(score, 100); // Cap at 100
  }

  // Utility functions

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.verificationCache.clear();
    console.log('Blockchain verification cache cleared');
  }

  getCacheStats() {
    return {
      size: this.verificationCache.size,
      timeout: this.cacheTimeout,
      hitRate: 0 // Would need to track hits/misses to calculate
    };
  }

  // Health check

  async getServiceHealth() {
    try {
      const smartContractHealth = await smartContractService.getServiceHealth();
      
      return {
        status: smartContractHealth.status === 'healthy' ? 'healthy' : 'degraded',
        smartContractService: smartContractHealth.status,
        cacheStats: this.getCacheStats(),
        lastVerification: new Date(),
        supportedChains: ['ethereum', 'polygon', 'base', 'solana']
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }
}

module.exports = new BlockchainVerificationService();