"""Warehouse map / simulation aggregate endpoint."""

from flask import g, jsonify, request

from middleware.auth_middleware import require_admin_or_page_permission, require_auth
from middleware.db import with_db
from routes.admin import admin_bp
from services.warehouse_map_service import build_warehouse_map


@admin_bp.route("/warehouse-map", methods=["GET"])
@require_auth
@require_admin_or_page_permission("warehouse-simulation")
@with_db
def get_warehouse_map():
    warehouse_id = request.args.get("warehouse_id", type=int)
    if not warehouse_id:
        return jsonify({"error": "warehouse_id is required"}), 400

    payload = build_warehouse_map(g.db, warehouse_id)
    if not payload:
        return jsonify({"error": "Warehouse not found"}), 404

    return jsonify(payload)
