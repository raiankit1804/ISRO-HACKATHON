from datetime import datetime, timezone, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session
from ..models import Item
from ..schemas import SimulationRequest, SimulationResponse
from .logging import LoggingService
import logging

logger = logging.getLogger(__name__)

class SimulationService:
    def __init__(self):
        self.logging_service = LoggingService()

    def simulate_time(
        self,
        db: Session,
        request: SimulationRequest
    ) -> SimulationResponse:
        current_date = datetime.now(timezone.utc)
        target_date = None

        if request.num_of_days:
            target_date = current_date + timedelta(days=request.num_of_days)
        elif request.to_timestamp:
            target_date = request.to_timestamp
        else:
            raise ValueError("Either num_of_days or to_timestamp must be provided")

        changes = {
            "dailyReports": [],
            "itemsUsedToday": [],
            "itemsDepletedToday": [],
            "itemsExpiredToday": [],
            "totalItemsUsed": 0,
            "totalItemsDepleted": 0,
            "totalItemsExpired": 0
        }

        for day in range(request.num_of_days):
            current_simulation_date = current_date + timedelta(days=day)
            logger.info(f"Processing day {day + 1}: {current_simulation_date}")
            
            daily_report = {
                "date": current_simulation_date.isoformat(),
                "items": []
            }

            # Process daily item usage
            for item_usage in request.items_to_be_used_per_day:
                item_id = item_usage.get("itemId")
                if not item_id:
                    continue

                item = db.query(Item).filter(Item.id == str(item_id)).first()
                if not item or item.is_waste:
                    continue

                old_uses = item.uses_remaining if item.uses_remaining is not None else None
                
                if item.usage_limit is not None and item.uses_remaining is not None:
                    if item.uses_remaining > 0:
                        item.uses_remaining = max(0, item.uses_remaining - 1)
                        changes["totalItemsUsed"] += 1
                        changes["itemsUsedToday"].append({
                            "itemId": item.id,
                            "name": item.name,
                            "remainingUses": item.uses_remaining
                        })

                        item_status = "Active"
                        if item.uses_remaining == 0:
                            item_status = "Depleted"
                            changes["totalItemsDepleted"] += 1
                            item.is_waste = True
                            changes["itemsDepletedToday"].append({
                                "itemId": item.id,
                                "name": item.name
                            })
                        
                        daily_report["items"].append({
                            "itemId": item.id,
                            "name": item.name,
                            "usesRemaining": item.uses_remaining,
                            "status": item_status
                        })
                        
                        # Log usage
                        self.logging_service.add_log(
                            db=db,
                            user_id="simulation",
                            action_type="retrieval",
                            item_id=item.id,
                            details={
                                "simulatedDate": current_simulation_date.isoformat(),
                                "oldUsesRemaining": old_uses,
                                "newUsesRemaining": item.uses_remaining,
                                "simulated": True
                            }
                        )

            # Check for expired items on this day
            expired_items = db.query(Item).filter(
                Item.expiry_date <= current_simulation_date,
                Item.is_waste == False
            ).all()

            for item in expired_items:
                changes["totalItemsExpired"] += 1
                changes["itemsExpiredToday"].append({
                    "itemId": item.id,
                    "name": item.name,
                    "expiryDate": item.expiry_date.isoformat()
                })
                item.is_waste = True

                daily_report["items"].append({
                    "itemId": item.id,
                    "name": item.name,
                    "status": "Expired",
                    "expiryDate": item.expiry_date.isoformat()
                })

                # Log expiration
                self.logging_service.add_log(
                    db=db,
                    user_id="simulation",
                    action_type="disposal",
                    item_id=item.id,
                    details={
                        "reason": "Expired",
                        "expiryDate": item.expiry_date.isoformat(),
                        "simulatedDate": current_simulation_date.isoformat()
                    }
                )

            changes["dailyReports"].append(daily_report)

        db.commit()
        logger.info("Simulation completed successfully")

        return SimulationResponse(
            success=True,
            newDate=target_date,
            changes=changes
        )