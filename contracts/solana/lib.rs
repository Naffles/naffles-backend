use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use std::collections::HashMap;

declare_id!("NaffStk1111111111111111111111111111111111111");

#[program]
pub mod naffles_staking {
    use super::*;

    // Staking duration constants (in seconds)
    pub const SIX_MONTHS: i64 = 180 * 24 * 60 * 60;
    pub const TWELVE_MONTHS: i64 = 365 * 24 * 60 * 60;
    pub const THREE_YEARS: i64 = 1095 * 24 * 60 * 60;
    
    // Emergency controls
    pub const EMERGENCY_DELAY: i64 = 24 * 60 * 60;
    pub const AUTO_UNPAUSE_DELAY: i64 = 7 * 24 * 60 * 60;

    pub fn initialize(ctx: Context<Initialize>, multi_sig_threshold: u8) -> Result<()> {
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.authority = ctx.accounts.authority.key();
        staking_program.multi_sig_threshold = multi_sig_threshold;
        staking_program.total_staked = 0;
        staking_program.total_collections = 0;
        staking_program.is_paused = false;
        staking_program.paused_at = 0;
        staking_program.bump = *ctx.bumps.get("staking_program").unwrap();
        
        Ok(())
    }

    pub fn add_admin(ctx: Context<AddAdmin>, admin: Pubkey) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        
        let admin_account = &mut ctx.accounts.admin_account;
        admin_account.admin = admin;
        admin_account.is_active = true;
        admin_account.added_at = Clock::get()?.unix_timestamp;
        admin_account.bump = *ctx.bumps.get("admin_account").unwrap();
        
        emit!(AdminAction {
            admin: ctx.accounts.authority.key(),
            action: "addAdmin".to_string(),
            data: admin.to_string(),
        });
        
        Ok(())
    }

    pub fn add_collection(
        ctx: Context<AddCollection>,
        collection_mint: Pubkey,
        six_month_tickets: u64,
        twelve_month_tickets: u64,
        three_year_tickets: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.collection_mint = collection_mint;
        collection_account.six_month_tickets = six_month_tickets;
        collection_account.twelve_month_tickets = twelve_month_tickets;
        collection_account.three_year_tickets = three_year_tickets;
        collection_account.six_month_multiplier = 11000; // 1.1x in basis points
        collection_account.twelve_month_multiplier = 12500; // 1.25x
        collection_account.three_year_multiplier = 15000; // 1.5x
        collection_account.is_active = true;
        collection_account.is_validated = false;
        collection_account.total_staked = 0;
        collection_account.bump = *ctx.bumps.get("collection_account").unwrap();
        
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.total_collections += 1;
        
        emit!(CollectionAdded {
            collection_mint,
            six_month_tickets,
            twelve_month_tickets,
            three_year_tickets,
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.authority.key(),
            action: "addCollection".to_string(),
            data: format!("{},{},{},{}", collection_mint, six_month_tickets, twelve_month_tickets, three_year_tickets),
        });
        
        Ok(())
    }

    pub fn stake_nft(
        ctx: Context<StakeNft>,
        duration: u8, // 0=6months, 1=12months, 2=3years
    ) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        require!(duration <= 2, StakingError::InvalidDuration);
        require!(ctx.accounts.collection_account.is_active, StakingError::CollectionNotActive);
        
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // Calculate unlock time
        let staking_duration = match duration {
            0 => SIX_MONTHS,
            1 => TWELVE_MONTHS,
            2 => THREE_YEARS,
            _ => return Err(StakingError::InvalidDuration.into()),
        };
        
        let unlock_at = current_time + staking_duration;
        
        // Transfer NFT to program
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.program_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;
        
        // Create staking position
        let staking_position = &mut ctx.accounts.staking_position;
        staking_position.owner = ctx.accounts.user.key();
        staking_position.nft_mint = ctx.accounts.nft_mint.key();
        staking_position.collection_mint = ctx.accounts.collection_account.collection_mint;
        staking_position.staked_at = current_time;
        staking_position.unlock_at = unlock_at;
        staking_position.duration = duration;
        staking_position.is_active = true;
        staking_position.total_rewards_earned = 0;
        staking_position.bump = *ctx.bumps.get("staking_position").unwrap();
        
        // Update statistics
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.total_staked += 1;
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.total_staked += 1;
        
        emit!(NftStaked {
            user: ctx.accounts.user.key(),
            nft_mint: ctx.accounts.nft_mint.key(),
            collection_mint: ctx.accounts.collection_account.collection_mint,
            duration,
            unlock_at,
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.user.key(),
            action: "stakeNft".to_string(),
            data: format!("{},{}", ctx.accounts.nft_mint.key(), duration),
        });
        
        Ok(())
    }

    pub fn claim_nft(ctx: Context<ClaimNft>) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        
        let staking_position = &mut ctx.accounts.staking_position;
        require!(staking_position.is_active, StakingError::PositionNotActive);
        require!(staking_position.owner == ctx.accounts.user.key(), StakingError::NotPositionOwner);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= staking_position.unlock_at, StakingError::StakingPeriodNotCompleted);
        
        // Mark position as inactive
        staking_position.is_active = false;
        
        // Transfer NFT back to user
        let seeds = &[
            b"staking_program",
            &[ctx.accounts.staking_program.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.program_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.staking_program.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;
        
        // Update statistics
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.total_staked -= 1;
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.total_staked -= 1;
        
        emit!(NftClaimed {
            user: ctx.accounts.user.key(),
            nft_mint: staking_position.nft_mint,
            collection_mint: staking_position.collection_mint,
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.user.key(),
            action: "claimNft".to_string(),
            data: staking_position.nft_mint.to_string(),
        });
        
        Ok(())
    }

    pub fn admin_unlock(
        ctx: Context<AdminUnlock>,
        reason: String,
    ) -> Result<()> {
        require!(!reason.is_empty(), StakingError::ReasonRequired);
        
        let staking_position = &mut ctx.accounts.staking_position;
        require!(staking_position.is_active, StakingError::PositionNotActive);
        
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // Check if emergency request exists
        let emergency_request = &mut ctx.accounts.emergency_request;
        if emergency_request.requested_at == 0 {
            // First request - start emergency delay
            emergency_request.requester = ctx.accounts.admin.key();
            emergency_request.requested_at = current_time;
            emergency_request.reason = reason.clone();
            emergency_request.executed = false;
            emergency_request.bump = *ctx.bumps.get("emergency_request").unwrap();
            
            emit!(EmergencyAction {
                admin: ctx.accounts.admin.key(),
                action: "emergencyUnlockRequested".to_string(),
                reason: reason.clone(),
            });
            
            return Ok(());
        }
        
        require!(current_time >= emergency_request.requested_at + EMERGENCY_DELAY, StakingError::EmergencyDelayNotMet);
        require!(!emergency_request.executed, StakingError::EmergencyRequestAlreadyExecuted);
        
        // Mark request as executed
        emergency_request.executed = true;
        
        // Mark position as inactive
        staking_position.is_active = false;
        
        // Transfer NFT back to owner
        let seeds = &[
            b"staking_program",
            &[ctx.accounts.staking_program.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.program_token_account.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.staking_program.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;
        
        // Update statistics
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.total_staked -= 1;
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.total_staked -= 1;
        
        emit!(EmergencyUnlock {
            admin: ctx.accounts.admin.key(),
            user: staking_position.owner,
            nft_mint: staking_position.nft_mint,
            reason: reason.clone(),
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.admin.key(),
            action: "adminUnlock".to_string(),
            data: format!("{},{}", staking_position.nft_mint, reason),
        });
        
        Ok(())
    }

    pub fn pause_contract(ctx: Context<PauseContract>) -> Result<()> {
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.is_paused = true;
        staking_program.paused_at = Clock::get()?.unix_timestamp;
        
        emit!(EmergencyAction {
            admin: ctx.accounts.admin.key(),
            action: "pauseContract".to_string(),
            reason: "Emergency pause activated".to_string(),
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.admin.key(),
            action: "pauseContract".to_string(),
            data: "".to_string(),
        });
        
        Ok(())
    }

    pub fn unpause_contract(ctx: Context<UnpauseContract>) -> Result<()> {
        let staking_program = &mut ctx.accounts.staking_program;
        staking_program.is_paused = false;
        staking_program.paused_at = 0;
        
        emit!(EmergencyAction {
            admin: ctx.accounts.admin.key(),
            action: "unpauseContract".to_string(),
            reason: "Contract unpaused".to_string(),
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.admin.key(),
            action: "unpauseContract".to_string(),
            data: "".to_string(),
        });
        
        Ok(())
    }

    pub fn update_collection_rewards(
        ctx: Context<UpdateCollectionRewards>,
        six_month_tickets: u64,
        twelve_month_tickets: u64,
        three_year_tickets: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.six_month_tickets = six_month_tickets;
        collection_account.twelve_month_tickets = twelve_month_tickets;
        collection_account.three_year_tickets = three_year_tickets;
        
        emit!(CollectionUpdated {
            collection_mint: collection_account.collection_mint,
            six_month_tickets,
            twelve_month_tickets,
            three_year_tickets,
        });
        
        emit!(AdminAction {
            admin: ctx.accounts.authority.key(),
            action: "updateCollectionRewards".to_string(),
            data: format!("{},{},{},{}", collection_account.collection_mint, six_month_tickets, twelve_month_tickets, three_year_tickets),
        });
        
        Ok(())
    }

    pub fn validate_collection(
        ctx: Context<ValidateCollection>,
        validated: bool,
    ) -> Result<()> {
        require!(!ctx.accounts.staking_program.is_paused, StakingError::ContractPaused);
        
        let collection_account = &mut ctx.accounts.collection_account;
        collection_account.is_validated = validated;
        
        emit!(AdminAction {
            admin: ctx.accounts.authority.key(),
            action: "validateCollection".to_string(),
            data: format!("{},{}", collection_account.collection_mint, validated),
        });
        
        Ok(())
    }
}

// Account structures
#[account]
pub struct StakingProgram {
    pub authority: Pubkey,
    pub multi_sig_threshold: u8,
    pub total_staked: u64,
    pub total_collections: u64,
    pub is_paused: bool,
    pub paused_at: i64,
    pub bump: u8,
}

#[account]
pub struct AdminAccount {
    pub admin: Pubkey,
    pub is_active: bool,
    pub added_at: i64,
    pub bump: u8,
}

#[account]
pub struct CollectionAccount {
    pub collection_mint: Pubkey,
    pub six_month_tickets: u64,
    pub twelve_month_tickets: u64,
    pub three_year_tickets: u64,
    pub six_month_multiplier: u64,
    pub twelve_month_multiplier: u64,
    pub three_year_multiplier: u64,
    pub is_active: bool,
    pub is_validated: bool,
    pub total_staked: u64,
    pub bump: u8,
}

#[account]
pub struct StakingPosition {
    pub owner: Pubkey,
    pub nft_mint: Pubkey,
    pub collection_mint: Pubkey,
    pub staked_at: i64,
    pub unlock_at: i64,
    pub duration: u8,
    pub is_active: bool,
    pub total_rewards_earned: u64,
    pub bump: u8,
}

#[account]
pub struct EmergencyRequest {
    pub requester: Pubkey,
    pub requested_at: i64,
    pub reason: String,
    pub executed: bool,
    pub bump: u8,
}

// Context structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"staking_program"],
        bump
    )]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddAdmin<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 1,
        seeds = [b"admin", admin.key().as_ref()],
        bump
    )]
    pub admin_account: Account<'info, AdminAccount>,
    
    /// CHECK: This is the admin being added
    pub admin: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddCollection<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1,
        seeds = [b"collection", collection_mint.key().as_ref()],
        bump
    )]
    pub collection_account: Account<'info, CollectionAccount>,
    
    /// CHECK: This is the collection mint being added
    pub collection_mint: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeNft<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub collection_account: Account<'info, CollectionAccount>,
    
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 8 + 1,
        seeds = [b"staking_position", nft_mint.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub staking_position: Account<'info, StakingPosition>,
    
    /// CHECK: This is the NFT mint being staked
    pub nft_mint: AccountInfo<'info>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub program_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimNft<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub collection_account: Account<'info, CollectionAccount>,
    
    #[account(mut)]
    pub staking_position: Account<'info, StakingPosition>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub program_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminUnlock<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub collection_account: Account<'info, CollectionAccount>,
    
    #[account(mut)]
    pub staking_position: Account<'info, StakingPosition>,
    
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 32 + 8 + 200 + 1 + 1,
        seeds = [b"emergency_request", staking_position.key().as_ref()],
        bump
    )]
    pub emergency_request: Account<'info, EmergencyRequest>,
    
    pub admin_account: Account<'info, AdminAccount>,
    
    #[account(mut)]
    pub program_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseContract<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    pub admin_account: Account<'info, AdminAccount>,
    
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnpauseContract<'info> {
    #[account(mut)]
    pub staking_program: Account<'info, StakingProgram>,
    
    pub admin_account: Account<'info, AdminAccount>,
    
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateCollectionRewards<'info> {
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub collection_account: Account<'info, CollectionAccount>,
    
    pub admin_account: Account<'info, AdminAccount>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateCollection<'info> {
    pub staking_program: Account<'info, StakingProgram>,
    
    #[account(mut)]
    pub collection_account: Account<'info, CollectionAccount>,
    
    pub admin_account: Account<'info, AdminAccount>,
    
    pub authority: Signer<'info>,
}

// Events
#[event]
pub struct NftStaked {
    pub user: Pubkey,
    pub nft_mint: Pubkey,
    pub collection_mint: Pubkey,
    pub duration: u8,
    pub unlock_at: i64,
}

#[event]
pub struct NftClaimed {
    pub user: Pubkey,
    pub nft_mint: Pubkey,
    pub collection_mint: Pubkey,
}

#[event]
pub struct EmergencyUnlock {
    pub admin: Pubkey,
    pub user: Pubkey,
    pub nft_mint: Pubkey,
    pub reason: String,
}

#[event]
pub struct CollectionAdded {
    pub collection_mint: Pubkey,
    pub six_month_tickets: u64,
    pub twelve_month_tickets: u64,
    pub three_year_tickets: u64,
}

#[event]
pub struct CollectionUpdated {
    pub collection_mint: Pubkey,
    pub six_month_tickets: u64,
    pub twelve_month_tickets: u64,
    pub three_year_tickets: u64,
}

#[event]
pub struct SecurityViolation {
    pub violation_type: String,
    pub violator: Pubkey,
    pub details: String,
}

#[event]
pub struct AdminAction {
    pub admin: Pubkey,
    pub action: String,
    pub data: String,
}

#[event]
pub struct EmergencyAction {
    pub admin: Pubkey,
    pub action: String,
    pub reason: String,
}

// Error codes
#[error_code]
pub enum StakingError {
    #[msg("Contract is paused")]
    ContractPaused,
    
    #[msg("Invalid staking duration")]
    InvalidDuration,
    
    #[msg("Collection not active")]
    CollectionNotActive,
    
    #[msg("Position not active")]
    PositionNotActive,
    
    #[msg("Not position owner")]
    NotPositionOwner,
    
    #[msg("Staking period not completed")]
    StakingPeriodNotCompleted,
    
    #[msg("Reason required for emergency action")]
    ReasonRequired,
    
    #[msg("Emergency delay not met")]
    EmergencyDelayNotMet,
    
    #[msg("Emergency request already executed")]
    EmergencyRequestAlreadyExecuted,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid recipient address")]
    InvalidRecipient,
    
    #[msg("Collection already exists")]
    CollectionAlreadyExists,
    
    #[msg("Collection not found")]
    CollectionNotFound,
    
    #[msg("Insufficient multi-sig confirmations")]
    InsufficientMultiSigConfirmations,
}