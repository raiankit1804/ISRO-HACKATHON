from fastapi import FastAPI, UploadFile, File, Query, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from datetime import datetime, timezone
from typing import List, Optional
import logging
import traceback
from sqlalchemy.orm import Session
from .schemas import (
    PlacementRequest, PlacementResponse,
    SearchResponse, RetrievalRequest,
    PlaceItemRequest, WasteResponse,
    ReturnPlanRequest, ReturnPlanResponse,
    SimulationRequest, SimulationResponse,
    LogResponse
)
from .models import Item, Container
from .services.placement import PlacementService
from .services.search import SearchService
from .services.waste import WasteManagementService
from .services.simulation import SimulationService
from .services.logging import LoggingService
from .utils.database import get_db, init_db
from .utils.csv_handler import CSVHandler
from .utils.error_handling import InventoryError
from .middleware.error_handler import error_handler_middleware
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Space Station Inventory Management System")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount ARIS directory
app.mount("/ARIS", StaticFiles(directory="ARIS"), name="aris")

# Favicon route - fix to serve directly
app.mount("/favicon.ico", StaticFiles(directory="static/images"), name="favicon")

# Configure templates
templates = Jinja2Templates(directory="templates")

# Add error handling middleware
app.middleware("http")(error_handler_middleware)

# Initialize services
placement_service = PlacementService()
search_service = SearchService()  # Initialize as instance
waste_service = WasteManagementService()
simulation_service = SimulationService()
logging_service = LoggingService()

# Initialize database
init_db()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend routes
@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})

@app.get("/inventory")
async def inventory_page(request: Request, db: Session = Depends(get_db)):
    containers = db.query(Container).all()
    return templates.TemplateResponse("inventory.html", {
        "request": request,
        "containers": containers
    })

@app.get("/waste")
async def waste_page(request: Request):
    return templates.TemplateResponse("waste.html", {"request": request})

@app.get("/simulation")
async def simulation_page(request: Request):
    return templates.TemplateResponse("simulation.html", {"request": request})

@app.get("/about")
async def about_page(request: Request):
    return templates.TemplateResponse("about.html", {"request": request})

# API routes
@app.post("/api/placement", response_model=PlacementResponse)
async def placement_recommendations(
    request: PlacementRequest,
    db: Session = Depends(get_db)
):
    try:
        # Validate containers exist in database
        for container in request.containers:
            db_container = db.query(Container).filter(Container.id == container.container_id).first()
            if not db_container:
                raise InventoryError(
                    f"Container {container.container_id} not found in database",
                    {"containerId": container.container_id}
                )

        # Get placements and rearrangements
        placements, rearrangements = placement_service.optimize_placement(
            request.items,
            request.containers
        )

        # Calculate unplaced items
        placed_item_ids = {p.item_id for p in placements}
        unplaced_items = [
            item.item_id for item in request.items 
            if item.item_id not in placed_item_ids
        ]

        # Calculate space utilization for each container
        space_utilization = {}
        for container in request.containers:
            container_placements = [p for p in placements if p.container_id == container.container_id]
            total_volume = container.width * container.depth * container.height
            used_volume = sum(
                (p.position.end_coordinates.width - p.position.start_coordinates.width) *
                (p.position.end_coordinates.depth - p.position.start_coordinates.depth) *
                (p.position.end_coordinates.height - p.position.start_coordinates.height)
                for p in container_placements
            )
            utilization = (used_volume / total_volume) * 100 if total_volume > 0 else 0
            space_utilization[container.container_id] = round(utilization, 2)

        # Update database with placements
        for placement in placements:
            item = db.query(Item).filter(Item.id == placement.item_id).first()
            if item:
                item.container_id = placement.container_id
                item.position = {
                    "startCoordinates": placement.position.startCoordinates,
                    "endCoordinates": placement.position.endCoordinates
                }
                db.add(item)

        db.commit()

        return PlacementResponse(
            success=True,
            placements=placements,
            rearrangements=rearrangements,
            unplacedItems=unplaced_items,
            spaceUtilization=space_utilization
        )

    except InventoryError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": str(e), "details": e.details}
        )
    except Exception as e:
        logger.error(f"Error in placement: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"message": "Internal server error during placement"}
        )

@app.get("/api/search", response_model=SearchResponse)
async def search_item(
    itemId: Optional[str] = None,
    itemName: Optional[str] = None,
    userId: Optional[str] = None,
    db: Session = Depends(get_db)
):
    return search_service.search_item(db, itemId, itemName)

@app.post("/api/retrieve")
async def retrieve_item(
    request: RetrievalRequest,
    db: Session = Depends(get_db)
):
    # Handle timezone-aware timestamp
    if request.timestamp.tzinfo is None:
        timestamp = request.timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = request.timestamp

    success = search_service.log_retrieval(
        db,
        str(request.item_id),  # Ensure string ID
        request.user_id,
        timestamp
    )
    return {"success": success}

@app.post("/api/place")
async def place_item(
    request: PlaceItemRequest,
    db: Session = Depends(get_db)
):
    success = search_service.update_item_location(
        db,
        request.itemId,
        request.userId,
        request.containerId,
        request.position.dict(),
        request.timestamp
    )
    return {"success": success}

@app.get("/api/waste/identify", response_model=WasteResponse)
async def identify_waste(db: Session = Depends(get_db)):
    waste_items = waste_service.identify_waste_items(db)
    return WasteResponse(success=True, wasteItems=waste_items)

@app.post("/api/waste/return-plan", response_model=ReturnPlanResponse)
async def get_return_plan(
    request: ReturnPlanRequest,
    db: Session = Depends(get_db)
):
    return_plan, retrieval_steps, manifest = waste_service.plan_waste_return(
        db,
        request
    )
    return ReturnPlanResponse(
        success=True,
        returnPlan=return_plan,
        retrievalSteps=retrieval_steps,
        returnManifest=manifest
    )

@app.post("/api/waste/complete-undocking")
async def complete_undocking(
    undockingContainerId: str,
    timestamp: datetime,
    db: Session = Depends(get_db)
):
    success = waste_service.complete_undocking(
        db,
        undockingContainerId,
        timestamp
    )
    return {"success": success}

@app.post("/api/simulate/day", response_model=SimulationResponse)
async def simulate_days(
    request: SimulationRequest,
    db: Session = Depends(get_db)
):
    try:
        response = simulation_service.simulate_time(db, request)
        logger.info("Simulation completed successfully")
        return response
    except Exception as e:
        logger.error(f"Error in simulation: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"message": f"Simulation failed: {str(e)}"}
        )

@app.get("/api/simulation/status")
async def get_simulation_status(db: Session = Depends(get_db)):
    """Get current simulation status including totals for items used, depleted and expired"""
    try:
        # Get items with recorded usage
        used_items = db.query(Item).filter(
            Item.uses_remaining != None
        ).count()
        
        # Get depleted items
        depleted_items = db.query(Item).filter(
            Item.uses_remaining == 0
        ).count()
        
        # Get expired items
        expired_items = db.query(Item).filter(
            Item.is_waste == True,
            Item.expiry_date <= datetime.now(timezone.utc)
        ).count()
        
        return {
            "totalItemsUsed": used_items,
            "totalItemsDepleted": depleted_items,
            "totalItemsExpired": expired_items
        }
    except Exception as e:
        logger.error(f"Error getting simulation status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"message": "Error retrieving simulation status"}
        )

@app.post("/api/import/items")
async def import_items(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    contents = await file.read()
    result = await CSVHandler.import_items(db, contents)
    db.commit()  # Ensure changes are committed
    return {
        "success": result.get("success", False),
        "itemsImported": result.get("itemsImported", 0),
        "errors": result.get("errors", []),
        "message": str(result)  # Add full result for debugging
    }

@app.post("/api/import/containers")
async def import_containers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    contents = await file.read()
    result = await CSVHandler.import_containers(db, contents)
    db.commit()  # Ensure changes are committed
    return result

@app.get("/api/export/arrangement")
async def export_arrangement(db: Session = Depends(get_db)):
    csv_content = CSVHandler.export_arrangement(db)
    return {"content": csv_content}

@app.get("/api/logs", response_model=LogResponse)
async def get_logs(
    startDate: datetime,
    endDate: datetime,
    itemId: Optional[str] = None,
    userId: Optional[str] = None,
    actionType: Optional[str] = Query(None, regex="^(placement|retrieval|rearrangement|disposal)$"),
    db: Session = Depends(get_db)
):
    return logging_service.get_logs(
        db,
        startDate,
        endDate,
        itemId,
        userId,
        actionType
    )

@app.get("/api/containers/check")
async def check_containers(db: Session = Depends(get_db)):
    count = db.query(Container).count()
    return {"containersExist": count > 0}

@app.get("/api/items/check")
async def check_items(db: Session = Depends(get_db)):
    count = db.query(Item).count()
    return {"itemsExist": count > 0}

@app.get("/api/containers/{container_id}")
async def get_container(container_id: str, db: Session = Depends(get_db)):
    container = db.query(Container).filter(Container.id == container_id).first()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    return {
        "id": container.id,
        "zone": container.zone,
        "width": container.width,
        "depth": container.depth,
        "height": container.height
    }

@app.get("/api/containers/{container_id}/items")
async def get_container_items(container_id: str, db: Session = Depends(get_db)):
    items = db.query(Item).filter(
        Item.container_id == container_id,
        Item.is_waste == False
    ).all()
    return [{
        "itemId": item.itemId,
        "name": item.name,
        "width": item.width,
        "depth": item.depth,
        "height": item.height,
        "mass": item.mass,
        "priority": item.priority,
        "position": item.position,
        "expiryDate": item.expiry_date.isoformat() if item.expiry_date else None,
        "usageLimit": item.usage_limit,
        "usesRemaining": item.uses_remaining,
        "preferredZone": item.preferred_zone
    } for item in items]

@app.post("/api/placement/optimize")
async def optimize_placement(db: Session = Depends(get_db)):
    try:
        # Get all unplaced and non-waste items
        items = db.query(Item).filter(
            Item.container_id.is_(None),
            Item.is_waste == False
        ).all()
        
        # Get all containers
        containers = db.query(Container).all()
        
        # Validate we have both items and containers
        if not items:
            return {
                "success": False,
                "message": "No unplaced items found for optimization"
            }
        
        if not containers:
            return {
                "success": False,
                "message": "No containers available for placement"
            }
            
        # Convert items and containers to input format expected by placement service
        items_input = [{
            "itemId": item.itemId,
            "name": item.name,
            "width": item.width,
            "depth": item.depth,
            "height": item.height,
            "mass": item.mass,
            "priority": item.priority,
            "preferredZone": item.preferred_zone
        } for item in items]
        
        containers_input = [{
            "containerId": container.id,
            "zone": container.zone,
            "width": container.width,
            "depth": container.depth,
            "height": container.height
        } for container in containers]
            
        # Use placement service to optimize
        placement_service = PlacementService()
        placements, rearrangements = placement_service.optimize_placement(items_input, containers_input)
        
        # Update item positions in database
        for placement in placements:
            item = db.query(Item).filter(Item.itemId == placement.item_id).first()
            if item:
                item.container_id = placement.container_id
                item.position = {
                    "startCoordinates": placement.position.startCoordinates,
                    "endCoordinates": placement.position.endCoordinates
                }
                db.add(item)
                
        db.commit()
        return {
            "success": True,
            "placements": len(placements),
            "rearrangements": len(rearrangements)
        }
        
    except Exception as e:
        logger.error(f"Error in placement optimization: {str(e)}")
        db.rollback()
        return {
            "success": False, 
            "message": f"Placement optimization failed: {str(e)}"
        }

def _find_blocking_items(
        self,
        db: Session,
        target_item: Item
    ) -> List[Item]:
        """Find items that need to be moved to retrieve the target item"""
        if not target_item.position or not target_item.container_id:
            return []

        blocking_items = []
        container_items = db.query(Item).filter(
            Item.container_id == target_item.container_id,
            Item.itemId != target_item.itemId
        ).all()

        for item in container_items:
            if not item.position:
                continue

            # Check if this item blocks access to target item
            if self._blocks_access(item, target_item):
                blocking_items.append(item)

        return blocking_items

@app.post("/api/retrieval/initiate")
async def initiate_retrieval(
    itemId: str,
    db: Session = Depends(get_db)
):
    """Initiate the retrieval process for an item"""
    try:
        # Find the item
        item = db.query(Item).filter(Item.itemId == itemId).first()
        if not item:
            raise HTTPException(
                status_code=404,
                detail={"message": f"Item {itemId} not found"}
            )

        # Calculate retrieval steps
        retrieval_steps = search_service._calculate_retrieval_steps(db, item)

        # Verify arrangement against CSV file if item is placed
        arrangement_verified = False
        verification_message = None
        if item.container_id and item.position:
            arrangement_verified, verification_message = CSVHandler.verify_arrangement(
                item.itemId,
                item.container_id,
                item.position
            )

        # Log the retrieval initiation with verification status
        logging_service.add_log(
            db=db,
            user_id="system",  # Or get from auth context if available
            action_type="retrieval_initiated",
            item_id=itemId,
            details={
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "containerId": item.container_id,
                "position": item.position,
                "steps": len(retrieval_steps),
                "arrangementVerified": arrangement_verified,
                "verificationMessage": verification_message
            }
        )

        # Format response
        item_data = {
            "itemId": item.itemId,
            "name": item.name,
            "containerId": item.container_id,
            "position": item.position,
            "priority": item.priority,
            "expiryDate": item.expiry_date.isoformat() if item.expiry_date else None,
            "usageLimit": item.usage_limit,
            "usesRemaining": item.uses_remaining,
            "preferredZone": item.preferred_zone,
            "arrangementVerified": arrangement_verified,
            "verificationMessage": verification_message
        }

        # If arrangement verification failed, include warning in response
        response = {
            "success": True,
            "item": item_data,
            "retrievalSteps": retrieval_steps,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        if not arrangement_verified:
            response["warning"] = "Current item position does not match expected arrangement"
            response["details"] = verification_message

        return response

    except Exception as e:
        logger.error(f"Error initiating retrieval: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"message": f"Error initiating retrieval: {str(e)}"}
        )

@app.post("/api/retrieval/confirm")
async def confirm_retrieval(
    itemId: str,
    userId: str,
    db: Session = Depends(get_db)
):
    """Confirm and execute the retrieval of an item"""
    try:
        # Find the item
        item = db.query(Item).filter(Item.itemId == itemId).first()
        if not item:
            raise HTTPException(
                status_code=404,
                detail={"message": f"Item {itemId} not found"}
            )

        # Get current timestamp
        timestamp = datetime.now(timezone.utc)

        # Log the retrieval
        success = search_service.log_retrieval(
            db,
            itemId,
            userId,
            timestamp
        )

        if not success:
            raise HTTPException(
                status_code=500,
                detail={"message": "Failed to log retrieval"}
            )

        # Update item state
        old_container = item.container_id
        old_position = item.position

        # Clear container and position
        item.container_id = None
        item.position = None

        # Add detailed log entry
        logging_service.add_log(
            db=db,
            user_id=userId,
            action_type="retrieval_completed",
            item_id=itemId,
            details={
                "timestamp": timestamp.isoformat(),
                "previousContainer": old_container,
                "previousPosition": old_position,
                "usageLimit": item.usage_limit,
                "usesRemaining": item.uses_remaining,
                "isWaste": item.is_waste
            }
        )

        db.commit()

        return {
            "success": True,
            "message": "Item retrieved successfully",
            "timestamp": timestamp.isoformat()
        }

    except Exception as e:
        logger.error(f"Error confirming retrieval: {traceback.format_exc()}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={"message": f"Error confirming retrieval: {str(e)}"}
        )

@app.get("/api/system/status")
async def get_system_status(db: Session = Depends(get_db)):
    """Get overall system status including space utilization and item counts"""
    try:
        # Get total items count
        active_items = db.query(Item).filter(Item.is_waste == False).count()
        waste_items = db.query(Item).filter(Item.is_waste == True).count()
        
        # Calculate space utilization across all containers
        containers = db.query(Container).all()
        total_space = sum(c.width * c.height * c.depth for c in containers) if containers else 1
        used_space = 0
        
        for container in containers:
            items = db.query(Item).filter(Item.container_id == container.id).all()
            for item in items:
                if item.position:  # Only count items with valid positions
                    used_space += (
                        (item.position["endCoordinates"]["width"] - item.position["startCoordinates"]["width"]) *
                        (item.position["endCoordinates"]["height"] - item.position["startCoordinates"]["height"]) *
                        (item.position["endCoordinates"]["depth"] - item.position["startCoordinates"]["depth"])
                    )
        
        space_utilization = (used_space / total_space * 100) if total_space > 0 else 0
        
        return {
            "spaceUtilization": round(space_utilization, 2),
            "activeItems": active_items,
            "wasteItems": waste_items
        }
    except Exception as e:
        logger.error(f"Error getting system status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"message": "Error retrieving system status"}
        )